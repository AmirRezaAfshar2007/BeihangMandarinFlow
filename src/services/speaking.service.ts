import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { SpeakingAttempt } from '../models/SpeakingAttempt.ts';
import type { ISpeakingScores, SpeakingDifficulty } from '../models/SpeakingAttempt.ts';
import { getQwenClient, extractJsonObject } from './qwen.service.ts';
import { Stats } from '../models/Stats.ts';
import { AppError } from '../utils/errors.ts';
import { env } from '../config/env.ts';
import { Semaphore } from '../utils/concurrency.ts';

ffmpeg.setFfmpegPath(ffmpegPath.path);

/* -------------------------------------------------------------------------- */
/* Concurrency pools                                                          */
/* -------------------------------------------------------------------------- */
//
// Every speaking request used to spawn its own ffmpeg child process and open
// its own AI call, with nothing bounding how many ran at once. A class of
// students recording together — or one student leaving a few tabs open — was
// therefore enough to push a 512 MB instance into swap or an OOM kill, and
// since ffmpeg is CPU-bound it also made every other request slower. These two
// pools cap how much heavy work is in flight at any moment; excess requests
// wait briefly and then fail fast with a 503 instead of taking the process
// down with them.
const ffmpegPool = new Semaphore(env.ffmpegConcurrency, 'ffmpeg');
const aiPool = new Semaphore(env.aiConcurrency, 'ai');

/** Pool load, surfaced on /api/health so overload is visible before it bites. */
export function getSpeakingPoolStats() {
  return [ffmpegPool.stats(), aiPool.stats()];
}

// The client-reported duration is only a hint (and is validated separately by
// the route); this is the limit the *measured* duration has to respect before
// any audio is handed to the AI. Kept in step with the route-level check so a
// request that lies about its length cannot produce an oversized AI payload.
const MAX_ANALYSIS_DURATION_SECONDS = 300;

// Each analysis transcodes audio with ffmpeg and calls the AI voice model —
// the single most resource- and cost-heavy action in the app. Capping it per
// student per day (rather than only the IP-based speakingAnalysisLimiter in
// rateLimit.ts) keeps both the server and the AI bill predictable regardless
// of how many students are enrolled.
export const DAILY_SPEAKING_LIMIT = 3;

// The browser records audio as WebM/Opus (or MP4/AAC on Safari), but Qwen-Omni's
// documented input_audio formats are WAV/MP3/M4A/OGG/FLAC — WebM/Opus isn't
// listed. Rather than gamble on undocumented format support, we transcode
// to WAV server-side with ffmpeg before sending it to the AI. This is the one
// piece of real complexity this migration added; everything else is a
// like-for-like client swap.
// --- Silence / empty-recording detection ------------------------------------
//
// Root cause of the "hallucinated transcript" bug: analyzeSpeaking() used to
// hand every recording straight to Qwen-Omni and trust whatever transcript it
// returned, even for a completely silent/empty clip. LLMs asked to
// "transcribe this audio" will often produce a plausible-sounding sentence
// rather than admitting they heard nothing — that's the hallucination the
// user hit. Asking the model more nicely in the prompt is not a reliable fix
// on its own, so detection now happens twice, independently:
//   1. Deterministic, non-AI signal: ffmpeg's volumedetect filter measures
//      the actual decoded peak/mean loudness of the clip. True silence (or a
//      near-empty recording) measures far below any real speech, regardless
//      of what any model would guess. If this fires, we never even call the
//      AI — there is nothing to hallucinate about.
//   2. Model self-report: the analysis prompt requires Qwen to return an
//      empty transcript when it doesn't hear real speech, and the parsed
//      response is validated for that afterward (see analyzeSpeaking), so a
//      borderline clip that passes step 1 but that the model genuinely can't
//      make out still can't be scored as if it were a real answer.
const SILENCE_MAX_VOLUME_DB_THRESHOLD = -50; // dBFS peak below this = no audible speech
const MIN_SPEECH_DURATION_SECONDS = 0.35; // shorter than this can't contain a spoken sentence

interface TranscodeResult {
  wavBase64: string;
  durationSeconds: number;
  maxVolumeDb: number | null;
  meanVolumeDb: number | null;
}

async function transcodeAndProbe(
  audioBase64: string,
  mimeType: string,
  options: { bestEffort?: boolean } = {}
): Promise<TranscodeResult> {
  const tmpDir = os.tmpdir();
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const inputPath = path.join(tmpDir, `speaking-${randomUUID()}.${ext}`);
  const outputPath = path.join(tmpDir, `speaking-${randomUUID()}.wav`);

  // Claim an ffmpeg slot before writing anything to disk.
  //
  // A real analysis waits for one (bounded by requestQueueTimeoutMs, then
  // fails with an honest 503). A live caption never waits: it is optional UI
  // polish whose failure the user cannot even see, so queueing it would only
  // push real submissions further back for no benefit — `tryAcquire` coming
  // back null simply means "skip this caption tick".
  const releaseSlot = options.bestEffort
    ? ffmpegPool.tryAcquire()
    : await ffmpegPool.acquire(
        env.requestQueueTimeoutMs,
        'The server is busy processing recordings right now. Please try again in a few seconds.'
      );

  if (!releaseSlot) {
    throw new AppError('Audio processor busy; caption skipped.', 503);
  }

  try {
    await fs.writeFile(inputPath, Buffer.from(audioBase64, 'base64'));

    let ffmpegStderr = '';

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        fn();
      };

      const command = ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioFilters('volumedetect')
        .format('wav')
        .on('stderr', (line: string) => {
          ffmpegStderr += line + '\n';
        })
        .on('error', (err: Error) =>
          finish(() =>
            reject(
              timedOut
                ? new AppError(
                    'Audio processing took too long and was stopped. Please try a shorter recording.',
                    408
                  )
                : err
            )
          )
        )
        .on('end', () => finish(() => resolve()));

      // Hard ceiling on the child process. Without this, a wedged ffmpeg (odd
      // container, truncated header, blocked write) holds its request, its
      // buffers and one of the pool slots indefinitely — the exact shape of a
      // slow leak that only becomes visible after weeks of pilot traffic.
      const killTimer = setTimeout(() => {
        timedOut = true;
        console.warn(`[speaking] ffmpeg exceeded ${env.ffmpegTimeoutMs}ms; killing it.`);
        try {
          command.kill('SIGKILL');
        } catch {
          // Already gone — the error handler above still settles the promise.
        }
      }, env.ffmpegTimeoutMs);
      // Not unref'd: this timer is the only thing guaranteeing a wedged ffmpeg
      // is killed, so it must be able to fire even if the child process has
      // stopped keeping the event loop alive.

      command.save(outputPath);
    });

    const wavBuffer = await fs.readFile(outputPath);

    const durationMatch = ffmpegStderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const durationSeconds = durationMatch
      ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
      : 0;

    const meanMatch = ffmpegStderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    const maxMatch = ffmpegStderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);

    return {
      wavBase64: wavBuffer.toString('base64'),
      durationSeconds,
      meanVolumeDb: meanMatch ? Number(meanMatch[1]) : null,
      maxVolumeDb: maxMatch ? Number(maxMatch[1]) : null,
    };
  } finally {
    // Ordering matters: free the slot first so a queued request can start
    // working while this one finishes tidying up its scratch files.
    releaseSlot();
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

// True only when the clip is confidently empty/silent — deliberately
// conservative (biased toward still asking the AI) so quiet-but-real speech
// is never rejected. `maxVolumeDb === null` means the filter output couldn't
// be parsed; in that case we don't claim silence and fall through to the AI.
function isEffectivelySilent(probe: TranscodeResult): boolean {
  if (probe.durationSeconds > 0 && probe.durationSeconds < MIN_SPEECH_DURATION_SECONDS) return true;
  if (probe.maxVolumeDb !== null && probe.maxVolumeDb < SILENCE_MAX_VOLUME_DB_THRESHOLD) return true;
  return false;
}

// Qwen-Omni's JSON output isn't governed by a strict schema the way Gemini's
// was (see extractJsonObject's comment above) — in practice it sometimes
// wraps a single-sentence field in a one-element array, or returns a
// newline-separated string where an array was asked for. These coerce
// either shape into what the Mongoose schema actually expects, instead of
// letting a shape mismatch throw and silently drop a good analysis.
function toStr(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(' ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function toStrArray(value: unknown, max: number): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).slice(0, max);
  if (typeof value === 'string' && value.trim()) {
    return value.split(/\r?\n|;|、/).map((s) => s.trim()).filter(Boolean).slice(0, max);
  }
  return [];
}

interface Challenge {
  id: string;
  prompt: string;
  translation: string;
}

const CHALLENGES: Record<SpeakingDifficulty, Challenge[]> = {
  beginner: [
    { id: 'b1', prompt: '介绍一下你自己：你的名字、你来自哪里、你在学什么。', translation: 'Introduce yourself: your name, where you are from, and what you study.' },
    { id: 'b2', prompt: '说说你每天从早到晚的日常生活。', translation: 'Describe your daily routine from morning to night.' },
    { id: 'b3', prompt: '介绍一下你的家人。', translation: 'Talk about your family members.' },
    { id: 'b4', prompt: '说说今天的天气，以及你喜欢在这样的天气做什么。', translation: 'Describe the weather today and what you like to do in this weather.' },
    { id: 'b5', prompt: '说说你最喜欢的食物，以及为什么喜欢它。', translation: 'Talk about your favorite food and why you like it.' },
  ],
  intermediate: [
    { id: 'i1', prompt: '说说你最喜欢的电影，以及你为什么喜欢它。', translation: 'Talk about your favorite movie and why you enjoy it.' },
    { id: 'i2', prompt: '说说一次让你印象深刻的旅行，是什么让它变得特别？', translation: 'Describe a memorable trip you took and what made it special.' },
    { id: 'i3', prompt: '说说你平时周末是怎么度过的。', translation: 'Explain how you usually spend your weekends.' },
    { id: 'i4', prompt: '向一个从未去过的人介绍一下你的家乡。', translation: 'Describe your hometown to someone who has never been there.' },
    { id: 'i5', prompt: '说说你想学习的一项技能，以及原因。', translation: 'Talk about a skill you would like to learn and why.' },
  ],
  advanced: [
    { id: 'a1', prompt: '谈谈你对科技在现代教育中所起作用的看法。', translation: 'Explain your opinion about the role of technology in modern education.' },
    { id: 'a2', prompt: '讨论一下住在大城市的优点和缺点。', translation: 'Discuss the advantages and disadvantages of living in a big city.' },
    { id: 'a3', prompt: '说说你克服过的一个困难，以及你从中学到了什么。', translation: 'Describe a challenge you overcame and what you learned from it.' },
    { id: 'a4', prompt: '谈谈你对社交媒体是否对社会有积极影响的看法。', translation: 'Give your opinion on whether social media has a positive or negative impact on society.' },
    { id: 'a5', prompt: '介绍一个你文化中的传统，以及它为什么有意义。', translation: 'Explain a tradition from your culture and why it is meaningful.' },
  ],
};

export function getRandomChallenge(difficulty: SpeakingDifficulty): Challenge {
  const pool = CHALLENGES[difficulty] || CHALLENGES.beginner;
  return pool[Math.floor(Math.random() * pool.length)];
}

function serializeAttempt(attempt: any) {
  return {
    ...attempt,
    id: attempt._id.toString(),
    _id: undefined,
  };
}

// Only a student's MAX_HISTORY_PER_STUDENT most recent speaking attempts are
// kept in the database. Speaking attempts are heavy documents (transcript,
// pinyin, per-category scores, several feedback arrays), and the history view
// only ever surfaces recent results — so instead of accumulating every attempt
// forever, each new save prunes anything older than the cap below.
const MAX_HISTORY_PER_STUDENT = 5;

interface NewAttemptData {
  studentId: string;
  challengePrompt: string;
  difficulty: SpeakingDifficulty;
  durationSeconds: number;
  aiAvailable: boolean;
  noSpeechDetected?: boolean;
  transcript?: string;
  transcriptPinyin?: string;
  scores?: ISpeakingScores | null;
  strengths?: string[];
  improvementTips?: string[];
  mispronuncedWords?: string[];
  suggestedPhrases?: string[];
  analysisError?: string;
}

// Every way an attempt lands in the DB funnels through here (real analysis,
// no-speech stub, AI-unavailable stub, AI-error stub), so the per-student cap
// enforced by pruneHistory can't be bypassed by a new save path.
async function saveAttempt(data: NewAttemptData) {
  const attempt = await SpeakingAttempt.create(data);
  await pruneHistory(data.studentId);
  return serializeAttempt(attempt.toObject());
}

// Deletes all but the newest MAX_HISTORY_PER_STUDENT attempts for a student.
// Safe under concurrent saves: whatever the newest 5 are at prune time are
// always kept, and anything older is removed.
async function pruneHistory(studentId: string) {
  const latest = await SpeakingAttempt.find({ studentId })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_PER_STUDENT)
    .select('_id')
    .lean();
  const keepIds = latest.map((a) => a._id);
  const { deletedCount } = await SpeakingAttempt.deleteMany({
    studentId,
    _id: { $nin: keepIds },
  });
  if (deletedCount > 0) {
    console.log(
      `[speaking] pruned ${deletedCount} old attempt(s) for student ${studentId} (keeping newest ${MAX_HISTORY_PER_STUDENT})`
    );
  }
}

const ZERO_SCORES = { overall: 0, pronunciation: 0, grammar: 0, fluency: 0, vocabulary: 0 };
const NO_SPEECH_MESSAGE = 'No speech detected. Please try recording again.';

async function createNoSpeechAttempt(params: AnalyzeParams) {
  const { studentId, challengePrompt, difficulty, durationSeconds } = params;
  return saveAttempt({
    studentId,
    challengePrompt,
    difficulty,
    durationSeconds,
    aiAvailable: true,
    noSpeechDetected: true,
    transcript: '',
    transcriptPinyin: '',
    scores: ZERO_SCORES,
    strengths: [],
    improvementTips: [NO_SPEECH_MESSAGE],
    mispronuncedWords: [],
    suggestedPhrases: [],
    analysisError: NO_SPEECH_MESSAGE,
  });
}

interface AnalyzeParams {
  studentId: string;
  audioBase64: string;
  mimeType: string;
  challengePrompt: string;
  difficulty: SpeakingDifficulty;
  durationSeconds: number;
}

interface TranscribeChunkParams {
  audioBase64: string;
  mimeType: string;
}

// Powers the LIVE caption the user sees while still speaking (before they
// hit Submit). This used to be done entirely client-side via the browser's
// built-in Web Speech API (`webkitSpeechRecognition`), which is free and
// instant but is NOT actually a browser feature — Chrome ships no on-device
// recognizer, so under the hood it silently streams the mic audio to
// Google's speech servers and streams text back. That's a *second*, entirely
// separate dependency on Google infrastructure, independent of whichever AI
// provider the backend calls. Migrating the backend from Gemini to Qwen
// (DashScope) fixed the analysis step for mainland-China users, but the live
// captions kept relying on the browser's hidden call to Google and stayed
// broken for exactly the same reachability reason the backend was moved off
// Gemini in the first place — swapping the backend model could never have
// fixed a bug that lives in the browser's own network stack.
// The fix: do live captioning the same way the final analysis is done — by
// sending audio to our own backend, which forwards it to DashScope (Qwen),
// which is reachable domestically. The client calls this endpoint every few
// seconds with the recording captured so far; this function transcribes it
// with a short, transcription-only prompt (no scoring, no JSON) so it stays
// fast enough to feel "live". The authoritative transcript + scores still
// come from analyzeSpeaking() once the user submits.
export async function transcribeChunk(params: TranscribeChunkParams): Promise<{ transcript: string }> {
  const { audioBase64, mimeType } = params;

  const ai = getQwenClient();
  if (!ai) {
    // No API key configured — fail quietly. The caller treats a missing/failed
    // live caption as a non-fatal, UI-only degradation (see comment on the
    // frontend poller), never as a reason to interrupt or stop recording.
    return { transcript: '' };
  }

  // Optional work must never compete with a real submission for a slot: if the
  // pools are busy, skip this caption tick and let the next one try again.
  const releaseAi = aiPool.tryAcquire();
  if (!releaseAi) {
    return { transcript: '' };
  }

  try {
    const probe = await transcodeAndProbe(audioBase64, mimeType, { bestEffort: true });

    // Same reasoning as analyzeSpeaking(): a silent/near-empty chunk never
    // reaches the model, so the live caption can't flash a hallucinated
    // sentence while the user hasn't actually said anything yet.
    if (isEffectivelySilent(probe)) {
      return { transcript: '' };
    }

    const wavBase64 = probe.wavBase64;

    // Same model, and the same streamed-response handling, as analyzeSpeaking()
    // below — Qwen-Omni's audio-input models require stream: true (non-streaming
    // calls are rejected), so this mirrors the proven-working pattern exactly
    // rather than risking a subtly different, untested request shape.
    const stream = await ai.chat.completions.create({
      model: 'qwen-omni-turbo',
      messages: [
        {
          role: 'system',
          content: 'You transcribe spoken Mandarin Chinese audio into Chinese characters (Hanzi) as accurately and literally as possible.',
        },
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: `data:;base64,${wavBase64}`, format: 'wav' } },
            {
              type: 'text',
              text: 'Transcribe exactly what is said in this audio, in Chinese characters. Respond with ONLY the transcribed text and nothing else — no quotes, no punctuation commentary, no translation, no markdown. If the audio is silent or has no intelligible speech yet, respond with an empty string.',
            },
          ],
        },
      ],
      modalities: ['text'],
      stream: true,
      stream_options: { include_usage: false },
    } as any);

    let fullText = '';
    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') fullText += delta;
    }

    // Models occasionally wrap the answer in quotes or a code fence despite
    // being asked not to — strip that defensively rather than showing it raw.
    const cleaned = fullText
      .trim()
      .replace(/^```[a-z]*\s*|```$/gi, '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim();

    return { transcript: cleaned };
  } catch (err) {
    // One missed live caption tick is invisible to the user (the next tick
    // tries again a few seconds later) and must never surface as a request
    // failure the way a failed final analysis would.
    console.error('Live caption transcription failed:', err);
    return { transcript: '' };
  } finally {
    releaseAi();
  }
}

export async function analyzeSpeaking(params: AnalyzeParams) {
  const { studentId, audioBase64, mimeType, challengePrompt, difficulty, durationSeconds } = params;

  const ai = getQwenClient();

  if (!ai) {
    return saveAttempt({
      studentId,
      challengePrompt,
      difficulty,
      durationSeconds,
      aiAvailable: false,
      transcript: '',
      scores: null,
      strengths: [],
      improvementTips: [],
      mispronuncedWords: [],
      suggestedPhrases: [],
      analysisError: 'The AI speaking coach is not configured on this server yet.',
    });
  }

  // Bound how many analyses are talking to the AI at once.
  //
  // Acquired OUTSIDE the try below on purpose: a saturated pool has to reach
  // the caller as a 503. If it were raised inside, the catch-all fallback
  // further down would mistake it for an AI outage, save a pointless
  // "could not reach the AI service" attempt and burn one of the student's
  // three daily tries for a request the server never actually made.
  const releaseAi = await aiPool.acquire(
    env.requestQueueTimeoutMs,
    'The speaking coach is handling several recordings right now. Please try again in a few seconds.'
  );

  try {
    const probe = await transcodeAndProbe(audioBase64, mimeType);

    // Deterministic check first, no AI call involved: a truly silent/empty/
    // too-short recording never reaches the model at all, so there is
    // nothing for it to hallucinate a transcript from.
    if (isEffectivelySilent(probe)) {
      return await createNoSpeechAttempt(params);
    }

    // Enforce the length cap against the audio that was actually received.
    // The route can only check the client's claim, and the client's claim is
    // not something to trust: without this, a longer recording would be
    // transcoded to a multi-megabyte WAV and posted to the AI anyway.
    if (probe.durationSeconds > MAX_ANALYSIS_DURATION_SECONDS) {
      throw new AppError(
        `This recording is about ${Math.round(probe.durationSeconds)} seconds long. Please keep a speaking answer under ${
          MAX_ANALYSIS_DURATION_SECONDS / 60
        } minutes.`,
        413
      );
    }

    const wavBase64 = probe.wavBase64;

    const prompt = `You are an expert, encouraging Mandarin Chinese speaking coach listening to a language learner's recorded response to this speaking prompt: "${challengePrompt}" (difficulty level: ${difficulty}). The learner was asked to answer in Mandarin Chinese.

CRITICAL RULE — DO NOT HALLUCINATE: Only transcribe words you can actually, confidently hear spoken in the audio. If the audio contains no intelligible speech at all — for example it is silent, contains only background noise, static, breathing, or is too muffled/garbled to make out real words — you MUST NOT invent, guess, or reconstruct a plausible-sounding sentence. In that exact case, set "transcript" to an empty string "", set "transcriptPinyin" to an empty string "", set every score in "scores" to 0, leave "strengths" and "mispronuncedWords" and "suggestedPhrases" as empty arrays, and set "improvementTips" to ["${NO_SPEECH_MESSAGE}"]. This rule overrides every instruction below — never fabricate content to fill in the response shape.

If (and only if) you do hear real, intelligible speech, listen to the audio and:
1. Transcribe exactly what the speaker said in Chinese characters (Hanzi), in the "transcript" field. If they spoke partly or entirely in English or another language instead, transcribe what was actually said and reflect that honestly in your scoring. Never paraphrase, complete, or "clean up" a sentence into something the speaker didn't actually say.
2. Provide the Hanyu Pinyin (with tone marks) for that same transcript in the "transcriptPinyin" field.
3. Score their performance from 0-100 in four categories:
   - pronunciation: clarity of initials/finals and, most importantly, TONE ACCURACY (Mandarin is a tonal language — wrong tones should meaningfully lower this score even if the sounds themselves were clear)
   - grammar: Mandarin sentence structure, word order, correct use of particles (了, 的, 吗, 呢, etc.) and measure words
   - fluency: speaking speed, pauses, hesitation, natural flow
   - vocabulary: word variety and appropriateness for the difficulty level
4. Compute an overall score (0-100) reflecting the four categories. Be strict and realistic — do not give a generous score to a short, hesitant, or partial answer just to be encouraging. A one- or two-word fragment is not a complete answer to the prompt and should score low on fluency and overall, even if the words themselves were pronounced correctly.
5. List 2-4 specific strengths (in English, but you may reference specific Chinese words/phrases).
6. List 2-4 specific, actionable improvement tips (in English, referencing what was actually said — for tone issues, name the specific character and which tone they used vs. the correct one).
7. List up to 5 individual Chinese words or characters that were mispronounced, tonally incorrect, or unclear, if any (empty array if none).
8. Suggest up to 3 alternative Chinese words or phrases that would sound more natural or advanced for what they were trying to say.

Respond with ONLY a single JSON object, no surrounding prose or markdown fences, matching exactly this shape:
{
  "transcript": string,
  "transcriptPinyin": string,
  "scores": { "overall": number, "pronunciation": number, "grammar": number, "fluency": number, "vocabulary": number },
  "strengths": string[],
  "improvementTips": string[],
  "mispronuncedWords": string[],
  "suggestedPhrases": string[]
}`;

    const stream = await ai.chat.completions.create({
      model: 'qwen-omni-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a supportive, expert Mandarin Chinese speaking coach and applied linguist who gives precise, actionable feedback, with special attention to tone accuracy.',
        },
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: `data:;base64,${wavBase64}`, format: 'wav' } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      // Qwen-Omni only accepts audio in this SDK's typed content blocks when cast loosely;
      // TS types for the OpenAI client don't yet know about `input_audio`, hence the `as any` below.
      modalities: ['text'],
      stream: true,
      stream_options: { include_usage: false },
    } as any);

    let fullText = '';
    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') {
        fullText += delta;
      }
    }

    if (!fullText.trim()) {
      throw new Error('Empty AI response.');
    }

    const parsed = extractJsonObject(fullText);
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

    const transcript = toStr(parsed.transcript).trim();

    // Model self-report validation: even though a silent clip never reaches
    // here (caught above by isEffectivelySilent), the model can still
    // legitimately report "I didn't hear real speech" for a clip that has
    // audible noise but no actual words. Treat an empty transcript as
    // authoritative for "nothing to score" rather than trusting whatever
    // scores/strengths it may have filled in around that empty string —
    // never let a non-empty score set survive an empty transcript.
    if (!transcript) {
      return await createNoSpeechAttempt(params);
    }

    const attempt = await saveAttempt({
      studentId,
      challengePrompt,
      difficulty,
      durationSeconds,
      aiAvailable: true,
      noSpeechDetected: false,
      transcript,
      transcriptPinyin: toStr(parsed.transcriptPinyin),
      scores: {
        overall: clamp(parsed.scores?.overall),
        pronunciation: clamp(parsed.scores?.pronunciation),
        grammar: clamp(parsed.scores?.grammar),
        fluency: clamp(parsed.scores?.fluency),
        vocabulary: clamp(parsed.scores?.vocabulary),
      },
      strengths: toStrArray(parsed.strengths, 6),
      improvementTips: toStrArray(parsed.improvementTips, 6),
      mispronuncedWords: toStrArray(parsed.mispronuncedWords, 8),
      suggestedPhrases: toStrArray(parsed.suggestedPhrases, 5),
    });

    // Reward XP for completing a speaking practice attempt, same spirit as adding a character.
    await Stats.updateOne({ studentId }, { $inc: { totalXp: 20 } });

    return attempt;
  } catch (err) {
    // Pool saturation and over-length recordings are answers for the student,
    // not AI outages — never dress them up as one.
    if (err instanceof AppError) throw err;
    console.error('Speaking analysis failed:', err);
    return saveAttempt({
      studentId,
      challengePrompt,
      difficulty,
      durationSeconds,
      aiAvailable: false,
      transcript: '',
      scores: null,
      strengths: [],
      improvementTips: [],
      mispronuncedWords: [],
      suggestedPhrases: [],
      analysisError: 'Could not reach the AI service. This is usually a network, firewall, or proxy issue on the server — check your internet connection (see HTTPS_PROXY in .env if you\'re on a restricted network) and try again.',
    });
  } finally {
    releaseAi();
  }
}

export async function listHistory(studentId: string, limit = 50) {
  if (limit < 1 || limit > 200) {
    throw new AppError('Invalid history limit.', 400);
  }
  const attempts = await SpeakingAttempt.find({ studentId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return attempts.map(serializeAttempt);
}

export interface SpeakingUsage {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string; // ISO timestamp of the next UTC midnight
}

/**
 * How many of today's DAILY_SPEAKING_LIMIT speaking-analysis attempts this
 * student has already used, in UTC calendar days (matches how the server's
 * clock and MongoDB's Date type both work, so it doesn't depend on any one
 * student's or server's local timezone).
 */
export async function getSpeakingUsage(studentId: string): Promise<SpeakingUsage> {
  const now = new Date();
  const startOfDayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const resetsAt = new Date(startOfDayUtc.getTime() + 24 * 60 * 60 * 1000);

  const used = await SpeakingAttempt.countDocuments({
    studentId,
    createdAt: { $gte: startOfDayUtc },
  });

  return {
    used,
    limit: DAILY_SPEAKING_LIMIT,
    remaining: Math.max(0, DAILY_SPEAKING_LIMIT - used),
    resetsAt: resetsAt.toISOString(),
  };
}

/** Throws if this student has already used today's speaking attempts, before
 * any audio is transcoded or sent to the AI — the whole point is to reject
 * cheaply instead of doing the expensive work first and discarding it. */
export async function assertUnderDailySpeakingLimit(studentId: string): Promise<void> {
  const usage = await getSpeakingUsage(studentId);
  if (usage.remaining <= 0) {
    throw new AppError(
      `You've used all ${DAILY_SPEAKING_LIMIT} speaking practice attempts for today. Come back after midnight (UTC) for more.`,
      429
    );
  }
}