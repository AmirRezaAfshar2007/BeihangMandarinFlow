import { getQwenClient, extractJsonObject } from './qwen.service.ts';
import { AppError } from '../utils/errors.ts';

/**
 * AI exercise generation for Learning Hub.
 *
 * Reuses the existing Qwen/DashScope infrastructure (qwen.service.ts) — the
 * same OpenAI-compatible client the dictionary and Speaking Coach already
 * use — so no second AI architecture is introduced.
 *
 * CRITICAL PRODUCT RULE: this generator returns DRAFT questions only. It
 * never writes to the database and never publishes anything. The teacher
 * must review, edit, and explicitly save/publish through the normal
 * exercise endpoints.
 */

export interface AIDraftQuestion {
  id: string;
  type: 'short_answer' | 'multiple_choice' | 'fill_blank';
  prompt: string;
  options: string[];
  correctAnswer: string;
  points: number;
}

export interface AIDraftExercise {
  title: string;
  instructions: string;
  questions: AIDraftQuestion[];
  aiMeta: { topic: string; difficulty: string; requested: number; generated: number };
}

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const QUESTION_TYPES = ['short_answer', 'multiple_choice', 'fill_blank'] as const;
const MAX_QUESTIONS = 20;

export async function generateExerciseWithAI(body: unknown): Promise<AIDraftExercise> {
  const { topic, difficulty, questionCount } = (body ?? {}) as {
    topic?: unknown;
    difficulty?: unknown;
    questionCount?: unknown;
  };

  if (typeof topic !== 'string' || !topic.trim() || topic.trim().length > 120) {
    throw new AppError('Provide a topic of at most 120 characters (e.g. 把字句).', 400);
  }
  if (typeof difficulty !== 'string' || !DIFFICULTIES.includes(difficulty as (typeof DIFFICULTIES)[number])) {
    throw new AppError('Difficulty must be beginner, intermediate, or advanced.', 400);
  }
  const count = questionCount === undefined ? 6 : Number(questionCount);
  if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS) {
    throw new AppError(`Question count must be an integer between 1 and ${MAX_QUESTIONS}.`, 400);
  }

  const ai = getQwenClient();
  if (!ai) {
    throw new AppError(
      'The AI engine is not configured (missing DASHSCOPE_API_KEY). Create the questions manually instead.',
      503
    );
  }

  const difficultyHint: Record<(typeof DIFFICULTIES)[number], string> = {
    beginner: 'HSK 1-2 vocabulary and basic sentence patterns; keep sentences under 12 characters.',
    intermediate: 'HSK 3-4 vocabulary; everyday situational sentences of moderate length.',
    advanced: 'HSK 5-6 vocabulary; longer, nuanced sentences including written/formal register.',
  };

  const systemPrompt =
    'You are an expert Mandarin curriculum designer and HSK assessment writer. ' +
    'You output only valid JSON — no commentary, no markdown fences.';

  const userPrompt = `Create ${count} practice questions for Chinese-language students on the topic "${topic.trim()}" (${difficulty} level; ${difficultyHint[difficulty as (typeof DIFFICULTIES)[number]]}).

Mix question types: translation/short answer, multiple choice, and fill-in-the-blank. For multiple choice include 3-4 options where exactly one is correct. For fill-in-the-blank use ___ as the blank marker and provide the exact expected text as the answer.

Return a JSON object with exactly this shape:
{
  "title": "short exercise title in English",
  "instructions": "one sentence of instructions for students",
  "questions": [
    {
      "type": "short_answer" | "multiple_choice" | "fill_blank",
      "prompt": "the question text (use Chinese for the tested content)",
      "options": ["only for multiple_choice, 3-4 strings"],
      "correctAnswer": "the exact correct answer (must be one of options for multiple_choice)",
      "points": 1
    }
  ]
}`;

  const response = await ai.chat.completions.create({
    model: 'qwen-plus',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '';
  let parsed: { title?: unknown; instructions?: unknown; questions?: unknown };
  try {
    parsed = extractJsonObject(raw);
  } catch {
    throw new AppError('The AI returned a malformed response. Please try again.', 502);
  }

  const questionsRaw = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (questionsRaw.length === 0) {
    throw new AppError('The AI did not return any questions. Please try again.', 502);
  }

  // Defensive normalization — every value is validated/retyped server-side
  // before it can reach the teacher's editor (and later, the database via
  // the normal exercise endpoints, which run their own validation).
  const questions: AIDraftQuestion[] = questionsRaw.slice(0, count).map((q, i) => {
    const item = (q ?? {}) as Record<string, unknown>;
    const type = typeof item.type === 'string' && (QUESTION_TYPES as readonly string[]).includes(item.type)
      ? (item.type as AIDraftQuestion['type'])
      : 'short_answer';
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim().slice(0, 600) : '';
    const options = Array.isArray(item.options)
      ? item.options.map((o) => String(o ?? '').trim().slice(0, 200)).filter(Boolean)
      : [];
    const correctAnswer =
      typeof item.correctAnswer === 'string' ? item.correctAnswer.trim().slice(0, 600) : '';
    const points = Number.isInteger(item.points) && (item.points as number) >= 1 && (item.points as number) <= 100
      ? (item.points as number)
      : 1;
    return { id: `ai-${i}-${crypto.randomUUID().slice(0, 8)}`, type, prompt, options, correctAnswer, points };
  }).filter((q) => q.prompt.length > 0);

  if (questions.length === 0) {
    throw new AppError('The AI response contained no usable questions. Please try again.', 502);
  }

  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 160) : `${topic.trim()} Practice`,
    instructions:
      typeof parsed.instructions === 'string' && parsed.instructions.trim()
        ? parsed.instructions.trim().slice(0, 600)
        : `AI-generated practice on ${topic.trim()}. Review and edit before saving.`,
    questions,
    aiMeta: { topic: topic.trim(), difficulty, requested: count, generated: questions.length },
  };
}
