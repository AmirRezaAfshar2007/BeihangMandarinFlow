import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { VoiceAssignment, IVoiceSentence } from '../models/VoiceAssignment.ts';
import { VoiceSubmission } from '../models/VoiceSubmission.ts';
import { User } from '../models/User.ts';
import * as storageService from './storage.service.ts';
import { AppError, ConflictError, NotFoundError } from '../utils/errors.ts';

/**
 * School section business logic — the Voice Recording Exercise.
 *
 * Same authorization model as the Learning Hub (see the Authorization scope
 * note in learning.service.ts): the product has exactly two roles, `admin`
 * (the teaching role) and `student`. Every `/teacher/*` route is admin-only
 * and every `/student/*` route derives the student's identity from the JWT,
 * never from the request body.
 *
 * The difference that matters here is student work being *private*: a
 * recording is personal, so unlike courseware there is no shared-teacher
 * exception on the student side. A student can read exactly one submission's
 * audio — their own. Anyone else's id resolves to a 404 (not a 403), so the
 * endpoint never confirms that another student's submission exists.
 */

const MAX_SENTENCES = 20;
const MAX_SENTENCE_LENGTH = 400;
const MAX_TITLE_LENGTH = 160;
const MAX_INSTRUCTIONS_LENGTH = 1200;

function serialize<T extends { _id: Types.ObjectId }>(doc: T): T & { id: string } {
  return { ...doc, id: doc._id.toString() };
}

function assertValidObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError(`${label} not found.`);
  }
}

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

function validateSentence(raw: unknown, index: number): IVoiceSentence {
  const value = typeof raw === 'string' ? { text: raw } : ((raw ?? {}) as { id?: unknown; text?: unknown });
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!text) {
    throw new AppError(`Sentence ${index + 1} cannot be empty.`, 400);
  }
  if (text.length > MAX_SENTENCE_LENGTH) {
    throw new AppError(`Sentence ${index + 1} must be at most ${MAX_SENTENCE_LENGTH} characters.`, 400);
  }
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    text,
  };
}

export interface VoiceAssignmentInput {
  title: string;
  instructions: string;
  sentences: IVoiceSentence[];
  dueDate: Date | null;
}

export function validateVoiceAssignmentInput(body: unknown): VoiceAssignmentInput {
  const { title, instructions, sentences, dueDate } = (body ?? {}) as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    throw new AppError(`Assignment title must be between 1 and ${MAX_TITLE_LENGTH} characters.`, 400);
  }
  if (instructions !== undefined && instructions !== null) {
    if (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS_LENGTH) {
      throw new AppError(`Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`, 400);
    }
  }
  if (!Array.isArray(sentences) || sentences.length < 1) {
    throw new AppError('An assignment needs at least one sentence to read.', 400);
  }
  if (sentences.length > MAX_SENTENCES) {
    throw new AppError(`An assignment can have at most ${MAX_SENTENCES} sentences.`, 400);
  }
  const cleaned = sentences.map(validateSentence);
  // Sentence ids key the recorder's per-line UI state; duplicates would make
  // two lines highlight at once.
  if (new Set(cleaned.map((s) => s.id)).size !== cleaned.length) {
    throw new AppError('Sentence identifiers must be unique within an assignment.', 400);
  }

  let parsedDueDate: Date | null = null;
  if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
    if (typeof dueDate !== 'string' && !(dueDate instanceof Date)) {
      throw new AppError('Due date must be a valid date.', 400);
    }
    parsedDueDate = new Date(dueDate as string | Date);
    if (Number.isNaN(parsedDueDate.getTime())) {
      throw new AppError('Due date must be a valid date.', 400);
    }
  }

  return {
    title: title.trim(),
    instructions: typeof instructions === 'string' ? instructions.trim() : '',
    sentences: cleaned,
    dueDate: parsedDueDate,
  };
}

/* ------------------------------------------------------------------ */
/* Teacher — assignments                                               */
/* ------------------------------------------------------------------ */

async function getAssignmentOr404(assignmentId: string) {
  assertValidObjectId(assignmentId, 'Assignment');
  const assignment = await VoiceAssignment.findById(assignmentId).lean();
  if (!assignment) {
    throw new NotFoundError('Assignment not found.');
  }
  return assignment;
}

export async function createVoiceAssignment(teacherId: string, body: unknown) {
  const input = validateVoiceAssignmentInput(body);
  const assignment = await VoiceAssignment.create({ teacherId, ...input });
  return serialize(assignment.toObject());
}

export async function updateVoiceAssignment(assignmentId: string, body: unknown) {
  const assignment = await getAssignmentOr404(assignmentId);
  const input = validateVoiceAssignmentInput(body);
  const updated = await VoiceAssignment.findByIdAndUpdate(assignment._id, input, { new: true }).lean();
  return serialize(updated!);
}

export async function setVoiceAssignmentStatus(assignmentId: string, status: unknown) {
  if (status !== 'draft' && status !== 'published') {
    throw new AppError("Status must be 'draft' or 'published'.", 400);
  }
  const assignment = await getAssignmentOr404(assignmentId);
  const updated = await VoiceAssignment.findByIdAndUpdate(
    assignment._id,
    {
      status,
      // First publication is recorded and preserved across unpublish/republish,
      // matching lesson behavior.
      publishedAt: status === 'published' ? (assignment.publishedAt ?? new Date()) : assignment.publishedAt,
    },
    { new: true }
  ).lean();
  return serialize(updated!);
}

/**
 * Permanently deletes an assignment with everything attached to it, including
 * the stored recordings. Like deleteLesson, this is guarded upstream by an
 * explicit confirmation that names how much student work is at stake.
 */
export async function deleteVoiceAssignment(assignmentId: string) {
  const assignment = await getAssignmentOr404(assignmentId);
  const submissions = await VoiceSubmission.find({ assignmentId: assignment._id }).lean();
  for (const submission of submissions) {
    await storageService.deleteAudioFile(submission.audio.gridFsFileId, submission.audio.gridFsBucketName);
  }
  await VoiceSubmission.deleteMany({ assignmentId: assignment._id });
  await VoiceAssignment.deleteOne({ _id: assignment._id });
  return {
    success: true,
    message: `Assignment "${assignment.title}" was deleted along with ${submissions.length} submission(s).`,
    deletedSubmissions: submissions.length,
  };
}


/* ------------------------------------------------------------------ */
/* Purge audio files — نمره‌ها می‌مونن، فایل‌های صوتی حذف میشن       */
/* ------------------------------------------------------------------ */

/**
 * فایل‌های صوتی یه assignment رو از GridFS حذف می‌کنه.
 * اطلاعات submission (نمره، بازخورد، اسم دانشجو) دست نخورده می‌مونن.
 * فقط روی assignment هایی که همه submissionها review شدن کار می‌کنه،
 * مگه اینکه force=true باشه.
 */
export async function purgeAssignmentAudio(assignmentId: string, force = false) {
  const assignment = await getAssignmentOr404(assignmentId);

  const submissions = await VoiceSubmission.find({ assignmentId: assignment._id }).lean();
  const total = submissions.length;

  if (total === 0) {
    return { success: true, message: 'No submissions to purge.', purged: 0, skipped: 0 };
  }

  // اگه force نباشه، چک کن همه review شدن
  if (!force) {
    const unreviewed = submissions.filter((s) => s.status !== 'reviewed').length;
    if (unreviewed > 0) {
      throw new AppError(
        `${unreviewed} submission(s) have not been reviewed yet. Grade them first, or use force=true to purge anyway.`,
        409
      );
    }
  }

  let purged = 0;
  let skipped = 0;

  for (const sub of submissions) {
    // اگه قبلاً حذف شده (audioUrl = null یا gridFsFileId نداره) رد کن
    if (!sub.audio?.gridFsFileId) { skipped++; continue; }

    await storageService.deleteAudioFile(sub.audio.gridFsFileId, sub.audio.gridFsBucketName);

    // فیلد audio رو null کن تا معلوم باشه حذف شده
    await VoiceSubmission.updateOne(
      { _id: sub._id },
      { $unset: { 'audio.gridFsFileId': '' }, $set: { 'audio.size': 0 } }
    );
    purged++;
  }

  return {
    success: true,
    message: `Audio purged for "${assignment.title}". Grades and feedback are preserved.`,
    purged,
    skipped,
  };
}

/**
 * وضعیت صداهای یه assignment رو برمیگردونه.
 * معلم قبل از purge می‌تونه ببینه چند تا reviewed هستن.
 */
export async function getAssignmentAudioStats(assignmentId: string) {
  const assignment = await getAssignmentOr404(assignmentId);
  const submissions = await VoiceSubmission.find({ assignmentId: assignment._id }).lean();

  const total = submissions.length;
  const reviewed = submissions.filter((s) => s.status === 'reviewed').length;
  const hasAudio = submissions.filter((s) => !!s.audio?.gridFsFileId).length;
  const totalSizeBytes = submissions.reduce((sum, s) => sum + (s.audio?.size ?? 0), 0);

  return {
    assignmentId,
    title: assignment.title,
    total,
    reviewed,
    unreviewed: total - reviewed,
    hasAudio,
    alreadyPurged: total - hasAudio,
    totalSizeMB: +(totalSizeBytes / (1024 * 1024)).toFixed(2),
    canSafelyPurge: reviewed === total && total > 0,
  };
}

export async function getAssignmentForTeacher(assignmentId: string) {
  const assignment = await getAssignmentOr404(assignmentId);
  return {
    ...serialize(assignment),
    publishedAt: assignment.publishedAt ? assignment.publishedAt.toISOString() : null,
    dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

export interface TeacherAssignmentCard {
  id: string;
  teacherId: string;
  teacherName: string;
  isMine: boolean;
  title: string;
  instructions: string;
  sentences: IVoiceSentence[];
  sentenceCount: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  dueDate: string | null;
  submissionCount: number;
  pendingCount: number;
  reviewedCount: number;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listTeacherAssignments(authorId: string): Promise<TeacherAssignmentCard[]> {
  const [assignments, submissionAgg] = await Promise.all([
    VoiceAssignment.find({}).sort({ updatedAt: -1 }).limit(300).lean(),
    VoiceSubmission.aggregate<{
      _id: Types.ObjectId;
      students: string[];
      count: number;
      pending: number;
      reviewed: number;
    }>([
      {
        $group: {
          _id: '$assignmentId',
          students: { $addToSet: '$studentId' },
          count: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          reviewed: { $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const authorIds = [...new Set(assignments.map((a) => a.teacherId))];
  const authors = await User.find({ studentId: { $in: authorIds } }, { studentId: 1, fullName: 1 }).lean();
  const authorMap = new Map(authors.map((a) => [a.studentId, a.fullName]));
  const submissionMap = new Map(submissionAgg.map((c) => [c._id.toString(), c]));

  return assignments.map((assignment) => {
    const stats = submissionMap.get(assignment._id.toString());
    return {
      id: assignment._id.toString(),
      teacherId: assignment.teacherId,
      teacherName: authorMap.get(assignment.teacherId) ?? assignment.teacherId,
      isMine: assignment.teacherId === authorId,
      title: assignment.title,
      instructions: assignment.instructions,
      sentences: assignment.sentences.map((s) => ({ id: s.id, text: s.text })),
      sentenceCount: assignment.sentences.length,
      status: assignment.status as 'draft' | 'published',
      publishedAt: assignment.publishedAt ? assignment.publishedAt.toISOString() : null,
      dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
      submissionCount: stats?.count ?? 0,
      pendingCount: stats?.pending ?? 0,
      reviewedCount: stats?.reviewed ?? 0,
      studentCount: stats ? new Set(stats.students).size : 0,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  });
}

export async function getSchoolOverview(teacherId: string) {
  const [totalAssignments, publishedAssignments, myAssignments, totalStudents, submissions, reviewed] =
    await Promise.all([
      VoiceAssignment.countDocuments({}),
      VoiceAssignment.countDocuments({ status: 'published' }),
      VoiceAssignment.countDocuments({ teacherId }),
      User.countDocuments({ role: 'student' }),
      VoiceSubmission.countDocuments({}),
      VoiceSubmission.countDocuments({ status: 'reviewed' }),
    ]);

  return {
    totalAssignments,
    publishedAssignments,
    myAssignments,
    totalStudents,
    totalSubmissions: submissions,
    pendingSubmissions: Math.max(0, submissions - reviewed),
    reviewedSubmissions: reviewed,
  };
}

/* ------------------------------------------------------------------ */
/* Teacher — submissions                                               */
/* ------------------------------------------------------------------ */

type SubmissionAudio = {
  gridFsFileId: Types.ObjectId;
  gridFsBucketName: string;
  mimeType: string;
  size: number;
  durationSeconds: number;
};

type VoiceSubmissionLike = {
  _id: Types.ObjectId;
  studentId: string;
  studentName: string;
  assignmentId: Types.ObjectId;
  assignmentTitle: string;
  sentences: { id: string; text: string }[];
  audio: SubmissionAudio;
  status: string;
  submissionCount: number;
  teacherScore: number | null;
  teacherFeedback: string;
  reviewedAt: Date | null;
  createdAt: Date;
};

function audioMeta(audio: SubmissionAudio) {
  return {
    mimeType: audio.mimeType,
    size: audio.size,
    durationSeconds: audio.durationSeconds,
  };
}

/**
 * Every voice submission on the platform, newest first, optionally narrowed
 * to one assignment. `studentName` is resolved live from the User collection
 * (so a renamed account shows its current name) with the submission's own
 * snapshot as a fallback for since-deleted accounts.
 */
export async function listTeacherVoiceSubmissions(assignmentId?: string) {
  const query: { assignmentId?: Types.ObjectId } = {};
  if (assignmentId) {
    const assignment = await getAssignmentOr404(assignmentId);
    query.assignmentId = assignment._id;
  }
  const submissions = await VoiceSubmission.find(query).sort({ createdAt: -1 }).limit(500).lean();
  const studentIds = [...new Set(submissions.map((s) => s.studentId))];
  const students = await User.find({ studentId: { $in: studentIds } }, { studentId: 1, fullName: 1 }).lean();
  const nameMap = new Map(students.map((s) => [s.studentId, s.fullName]));

  return submissions.map((s) => ({
    id: s._id.toString(),
    studentId: s.studentId,
    studentName: nameMap.get(s.studentId) ?? s.studentName ?? s.studentId,
    assignmentId: s.assignmentId.toString(),
    assignmentTitle: s.assignmentTitle,
    status: s.status as 'submitted' | 'reviewed',
    submissionCount: s.submissionCount,
    teacherScore: s.teacherScore,
    teacherFeedback: s.teacherFeedback,
    submittedAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    audio: audioMeta(s.audio),
    sentenceCount: s.sentences.length,
  }));
}

function serializeSubmissionDetail(s: VoiceSubmissionLike) {
  return {
    id: s._id.toString(),
    studentId: s.studentId,
    studentName: s.studentName,
    assignmentId: s.assignmentId.toString(),
    assignmentTitle: s.assignmentTitle,
    sentences: s.sentences.map((x) => ({ id: x.id, text: x.text })),
    status: s.status as 'submitted' | 'reviewed',
    submissionCount: s.submissionCount,
    teacherScore: s.teacherScore,
    teacherFeedback: s.teacherFeedback,
    submittedAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    audio: audioMeta(s.audio),
  };
}

export async function getVoiceSubmissionForTeacher(submissionId: string) {
  assertValidObjectId(submissionId, 'Submission');
  const submission = await VoiceSubmission.findById(submissionId).lean();
  if (!submission) {
    throw new NotFoundError('Submission not found.');
  }
  const student = await User.findOne({ studentId: submission.studentId }, { fullName: 1, studentId: 1 }).lean();
  return serializeSubmissionDetail({
    ...submission,
    studentName: student?.fullName ?? submission.studentName ?? submission.studentId,
  });
}

export async function reviewVoiceSubmission(submissionId: string, body: { score: unknown; feedback: unknown }) {
  assertValidObjectId(submissionId, 'Submission');
  const { score, feedback } = body ?? ({} as { score: unknown; feedback: unknown });
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
    throw new AppError('Score must be a number between 0 and 100.', 400);
  }
  if (feedback !== undefined && feedback !== null) {
    if (typeof feedback !== 'string' || feedback.length > 2000) {
      throw new AppError('Feedback must be at most 2000 characters.', 400);
    }
  }
  const updated = await VoiceSubmission.findByIdAndUpdate(
    submissionId,
    {
      status: 'reviewed',
      teacherScore: score,
      teacherFeedback: typeof feedback === 'string' ? feedback.trim() : '',
      reviewedAt: new Date(),
    },
    { new: true }
  ).lean();
  if (!updated) {
    throw new NotFoundError('Submission not found.');
  }
  const student = await User.findOne({ studentId: updated.studentId }, { fullName: 1 }).lean();
  return serializeSubmissionDetail({
    ...updated,
    studentName: student?.fullName ?? updated.studentName ?? updated.studentId,
  });
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

function dueDateState(dueDate: Date | null | undefined) {
  const iso = dueDate ? new Date(dueDate).toISOString() : null;
  return {
    dueDate: iso,
    isOverdue: Boolean(iso && new Date(iso).getTime() < Date.now()),
  };
}

export async function listStudentAssignments(studentId: string) {
  const [assignments, mySubmissions] = await Promise.all([
    VoiceAssignment.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(200).lean(),
    VoiceSubmission.find({ studentId }, { assignmentId: 1, status: 1, teacherScore: 1 }).lean(),
  ]);

  const submissionMap = new Map(mySubmissions.map((s) => [s.assignmentId.toString(), s]));

  return assignments.map((assignment) => {
    const mine = submissionMap.get(assignment._id.toString());
    return {
      id: assignment._id.toString(),
      title: assignment.title,
      instructions: assignment.instructions,
      sentences: assignment.sentences.map((s) => ({ id: s.id, text: s.text })),
      sentenceCount: assignment.sentences.length,
      publishedAt: assignment.publishedAt ? assignment.publishedAt.toISOString() : null,
      ...dueDateState(assignment.dueDate),
      myStatus: (mine?.status ?? 'not_submitted') as 'not_submitted' | 'submitted' | 'reviewed',
      myScore: mine?.teacherScore ?? null,
    };
  });
}

/**
 * Everything the recorder needs for one assignment, including the student's
 * own submission (id + audio metadata) so a reload shows their recording
 * again. Drafts resolve to 404 for students, exactly like unpublished
 * lessons.
 */
export async function getStudentAssignment(studentId: string, assignmentId: string) {
  assertValidObjectId(assignmentId, 'Assignment');
  const assignment = await VoiceAssignment.findOne({ _id: assignmentId, status: 'published' }).lean();
  if (!assignment) {
    throw new NotFoundError('Assignment not found.');
  }
  const mine = await VoiceSubmission.findOne({ studentId, assignmentId: assignment._id }).lean();

  return {
    id: assignment._id.toString(),
    title: assignment.title,
    instructions: assignment.instructions,
    sentences: assignment.sentences.map((s) => ({ id: s.id, text: s.text })),
    publishedAt: assignment.publishedAt ? assignment.publishedAt.toISOString() : null,
    ...dueDateState(assignment.dueDate),
    submission: mine
      ? {
          id: mine._id.toString(),
          status: mine.status as 'submitted' | 'reviewed',
          submissionCount: mine.submissionCount,
          teacherScore: mine.teacherScore,
          teacherFeedback: mine.teacherFeedback,
          submittedAt: mine.createdAt.toISOString(),
          reviewedAt: mine.reviewedAt ? mine.reviewedAt.toISOString() : null,
          audio: audioMeta(mine.audio),
        }
      : null,
  };
}

export async function listMyVoiceSubmissions(studentId: string) {
  const submissions = await VoiceSubmission.find({ studentId }).sort({ createdAt: -1 }).limit(200).lean();
  return submissions.map((s) => ({
    id: s._id.toString(),
    assignmentId: s.assignmentId.toString(),
    assignmentTitle: s.assignmentTitle,
    status: s.status as 'submitted' | 'reviewed',
    submissionCount: s.submissionCount,
    teacherScore: s.teacherScore,
    teacherFeedback: s.teacherFeedback,
    submittedAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    audio: audioMeta(s.audio),
    sentenceCount: s.sentences.length,
  }));
}

/**
 * Stores (or replaces) the signed-in student's recording for one assignment.
 *
 * Re-submission is explicitly supported — a pronunciation exercise is about
 * getting it right, not about being locked out by a first attempt — and the
 * API makes that unambiguous: the previous recording is deleted and
 * `submissionCount` increments, so the teacher sees how many takes there were.
 * A reviewed submission goes back to `submitted` (the new take has not been
 * reviewed), which is the only honest state for it.
 *
 * The replacement order matters: the new audio is uploaded first and the row
 * is updated second, and only then is the old GridFS file removed. A failure
 * at any step therefore leaves a playable recording in place rather than a
 * submission pointing at bytes that no longer exist.
 */
export async function submitVoiceRecording(
  studentId: string,
  studentName: string,
  assignmentId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  rawDurationSeconds: unknown
) {
  assertValidObjectId(assignmentId, 'Assignment');
  const assignment = await VoiceAssignment.findOne({ _id: assignmentId, status: 'published' }).lean();
  if (!assignment) {
    throw new NotFoundError('Assignment not found.');
  }

  const duration = Number(rawDurationSeconds);
  const durationSeconds =
    Number.isFinite(duration) && duration > 0
      ? Math.min(Math.round(duration), storageService.MAX_AUDIO_DURATION_SECONDS)
      : 0;

  const stored = await storageService.storeAudio(file);
  const existing = await VoiceSubmission.findOne({ studentId, assignmentId: assignment._id }).lean();

  const payload = {
    studentId,
    studentName: studentName.slice(0, 120),
    assignmentId: assignment._id,
    assignmentTitle: assignment.title,
    // Snapshot of the prompt at submit time: the teacher reviews the text the
    // student actually saw, even if the assignment is edited afterwards.
    sentences: assignment.sentences.map((s) => ({ id: s.id, text: s.text })),
    audio: {
      gridFsFileId: stored.gridFsFileId,
      gridFsBucketName: stored.bucketName,
      mimeType: stored.mimeType,
      size: stored.size,
      durationSeconds,
    },
    status: 'submitted' as const,
    teacherScore: null,
    teacherFeedback: '',
    reviewedAt: null,
  };

  let submission: VoiceSubmissionLike;
  try {
    if (existing) {
      const updated = await VoiceSubmission.findByIdAndUpdate(
        existing._id,
        { ...payload, submissionCount: existing.submissionCount + 1 },
        { new: true }
      ).lean();
      if (!updated) {
        throw new NotFoundError('Submission not found.');
      }
      submission = updated as unknown as VoiceSubmissionLike;
    } else {
      const created = await VoiceSubmission.create({ ...payload, submissionCount: 1 });
      submission = created.toObject() as unknown as VoiceSubmissionLike;
    }
  } catch (err) {
    // The new audio is orphaned by a failed write — remove it instead of
    // leaving it in the bucket forever.
    await storageService.deleteAudioFile(stored.gridFsFileId, stored.bucketName);
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError('A submission already exists for this assignment. Please try again.');
    }
    throw err;
  }

  // Only now is the superseded recording removed.
  if (existing) {
    await storageService.deleteAudioFile(existing.audio.gridFsFileId, existing.audio.gridFsBucketName);
  }

  return {
    id: submission._id.toString(),
    assignmentId: submission.assignmentId.toString(),
    assignmentTitle: submission.assignmentTitle,
    status: submission.status as 'submitted' | 'reviewed',
    submissionCount: submission.submissionCount,
    teacherScore: submission.teacherScore,
    teacherFeedback: submission.teacherFeedback,
    submittedAt: submission.createdAt.toISOString(),
    reviewedAt: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
    audio: audioMeta(submission.audio),
    replaced: Boolean(existing),
  };
}

/**
 * Authorization for audio streaming.
 *
 * An admin (the teaching role) may play any submission; a student may play
 * only their own. A student asking for someone else's id gets a 404 — the same
 * answer as a nonexistent id — so the endpoint cannot be used to probe which
 * submissions exist.
 */
export async function getSubmissionAudioForAccess(
  identity: { studentId: string; role: string },
  submissionId: string
) {
  assertValidObjectId(submissionId, 'Submission');
  const submission = await VoiceSubmission.findById(submissionId).lean();
  if (!submission) {
    throw new NotFoundError('Submission not found.');
  }
  if (identity.role !== 'admin' && submission.studentId !== identity.studentId) {
    throw new NotFoundError('Submission not found.');
  }
  return submission;
}
