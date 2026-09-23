import crypto from 'node:crypto';
import { FilterQuery, Types } from 'mongoose';
import { Lesson, ILesson } from '../models/Lesson.ts';
import { LearningMaterial, ILearningMaterial } from '../models/LearningMaterial.ts';
import {
  LearningExercise,
  ILearningQuestion,
  LearningQuestionType,
} from '../models/LearningExercise.ts';
import { LearningSubmission } from '../models/LearningSubmission.ts';
import { Announcement } from '../models/Announcement.ts';
import { User } from '../models/User.ts';
import * as storageService from './storage.service.ts';
import { AppError, ConflictError, NotFoundError } from '../utils/errors.ts';

/**
 * Learning Hub business logic. Every function derives ownership from the
 * authenticated identity passed in by the routes (req.user) — never from
 * request bodies or query parameters.
 */

const QUESTION_TYPES: LearningQuestionType[] = ['short_answer', 'multiple_choice', 'fill_blank'];
const MAX_QUESTIONS = 50;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1200;

function serialize<T extends { _id: Types.ObjectId }>(doc: T): T & { id: string } {
  return { ...doc, id: doc._id.toString() };
}

/**
 * Structural shapes for lean() results. Mongoose's FlattenMaps<Doc> isn't
 * assignable to the full Document interfaces (connection client fields), but
 * the services only consume these plain data fields, so the mappers take
 * exactly what they read.
 */
type MaterialLike = {
  _id: Types.ObjectId;
  lessonId: Types.ObjectId;
  originalName: string;
  kind: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

type SubmissionLike = {
  _id: Types.ObjectId;
  studentId: string;
  lessonId: Types.ObjectId;
  exerciseId: Types.ObjectId;
  lessonTitle: string;
  exerciseTitle: string;
  status: string;
  autoScore: number;
  totalPoints: number;
  teacherScore: number | null;
  teacherFeedback: string;
  reviewedAt: Date | null;
  createdAt: Date;
  answers: {
    questionId: string;
    type: string;
    promptSnapshot: string;
    answer: string;
    autoCorrect: boolean | null;
    earnedPoints: number;
    maxPoints: number;
  }[];
};

function assertValidObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError(`${label} not found.`);
  }
}

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

export function validateLessonInput(body: unknown): { title: string; description: string } {
  const { title, description } = (body ?? {}) as { title?: unknown; description?: unknown };
  if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > MAX_TITLE_LENGTH) {
    throw new AppError(`Lesson title must be between 1 and ${MAX_TITLE_LENGTH} characters.`, 400);
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
      throw new AppError(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`, 400);
    }
  }
  return { title: title.trim(), description: (typeof description === 'string' ? description : '').trim() };
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    // Strip CJK + ASCII punctuation so "你好。" matches "你好" in fill-blank grading.
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

/**
 * Escapes user search input before it becomes a RegExp, so a stray "(" can't
 * throw and a crafted pattern can't trigger catastrophic backtracking.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* Authorization scope                                                 */
/* ------------------------------------------------------------------ */

/**
 * Who may see and manage what in the Learning Hub.
 *
 * The product has exactly two roles (src/models/User.ts): `admin` and
 * `student`. `admin` is both the teaching role and the platform superuser —
 * the same role that administers every user account in the Admin Portal — and
 * students are not grouped by teacher: listPublishedLessons() returns every
 * published lesson regardless of who authored it.
 *
 * Filtering teacher-side queries by `Lesson.teacherId` therefore hid real
 * student work from the only role able to act on it: the overview counted
 * submissions platform-wide (so the dashboard advertised pending reviews)
 * while the submissions list filtered to the signed-in admin's own lessons and
 * rendered "No submissions yet". Opening such a submission was rejected with a
 * 403 as well, for the same reason.
 *
 * So `teacherId` is authorship/attribution, not a tenancy boundary. The
 * /api/learning/teacher/* routes still enforce `role === 'admin'` before they
 * reach these services; a student is rejected up front and can only ever read
 * published lessons and their own submissions.
 */

export async function getLessonForAdmin(lessonId: string) {
  assertValidObjectId(lessonId, 'Lesson');
  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson) {
    throw new NotFoundError('Lesson not found.');
  }
  return lesson;
}

async function getExerciseForAdmin(exerciseId: string) {
  assertValidObjectId(exerciseId, 'Exercise');
  const exercise = await LearningExercise.findById(exerciseId).lean();
  if (!exercise) {
    throw new NotFoundError('Exercise not found.');
  }
  return exercise;
}

/* ------------------------------------------------------------------ */
/* Teacher — lessons                                                   */
/* ------------------------------------------------------------------ */

export async function createLesson(teacherId: string, body: unknown) {
  const input = validateLessonInput(body);
  const lesson = await Lesson.create({ teacherId, title: input.title, description: input.description });
  return serialize(lesson.toObject());
}

export async function updateLesson(lessonId: string, body: unknown) {
  const lesson = await getLessonForAdmin(lessonId);
  const input = validateLessonInput(body);
  const updated = await Lesson.findByIdAndUpdate(lesson._id, { title: input.title, description: input.description }, { new: true }).lean();
  return serialize(updated!);
}

/**
 * Permanently deletes a lesson and everything attached to it.
 *
 * Destructive by design and therefore never reached by an accident: the bulk
 * endpoint (bulkDeleteLessons) refuses lessons that already have student
 * submissions, and the single-lesson path is behind an explicit confirmation
 * that names how much student work is at stake (see LessonCard.submissionCount).
 */
export async function deleteLesson(lessonId: string) {
  const lesson = await getLessonForAdmin(lessonId);
  // Cascade: remove materials (documents + GridFS files), exercises and
  // submissions tied to this lesson.
  const [materials, exerciseCount, submissionCount] = await Promise.all([
    LearningMaterial.find({ lessonId: lesson._id }).lean(),
    LearningExercise.countDocuments({ lessonId: lesson._id }),
    LearningSubmission.countDocuments({ lessonId: lesson._id }),
  ]);
  for (const material of materials) {
    try {
      await storageService.deleteMaterialFile(material.gridFsFileId);
    } catch (err) {
      // A missing GridFS object must not block the lesson deletion.
      console.warn(`[learning] Could not delete GridFS file ${material.gridFsFileId}:`, err);
    }
  }
  await Promise.all([
    LearningMaterial.deleteMany({ lessonId: lesson._id }),
    LearningExercise.deleteMany({ lessonId: lesson._id }),
    LearningSubmission.deleteMany({ lessonId: lesson._id }),
  ]);
  await Lesson.deleteOne({ _id: lesson._id });
  return {
    success: true,
    message: `Lesson "${lesson.title}" was deleted along with ${materials.length} material(s), ${exerciseCount} exercise(s) and ${submissionCount} submission(s).`,
    deletedMaterials: materials.length,
    deletedExercises: exerciseCount,
    deletedSubmissions: submissionCount,
  };
}

export async function setLessonStatus(lessonId: string, status: 'draft' | 'published') {
  const lesson = await getLessonForAdmin(lessonId);
  const updated = await Lesson.findByIdAndUpdate(
    lesson._id,
    { status, publishedAt: status === 'published' ? (lesson.publishedAt ?? new Date()) : lesson.publishedAt },
    { new: true }
  ).lean();
  return serialize(updated!);
}

export interface LessonCard {
  id: string;
  title: string;
  description: string;
  status: string;
  publishedAt: string | null;
  /** Authorship — shown in the management list; no longer a query boundary. */
  authorId: string;
  authorName: string;
  isMine: boolean;
  materialCount: number;
  exerciseCount: number;
  studentCount: number;
  /** Total submissions received, and how many still await review. */
  submissionCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonListFilters {
  /** Case-insensitive match on the title or description. */
  q?: string;
  status?: 'all' | 'draft' | 'published';
  /** 'all' (default, the whole lesson set) or 'mine' (authored by this admin). */
  scope?: 'all' | 'mine';
}

/** Builds the Mongo filter for the management list from validated query input. */
function buildLessonQuery(teacherId: string, filters: LessonListFilters): FilterQuery<ILesson> {
  const query: FilterQuery<ILesson> = {};
  if (filters.status === 'draft' || filters.status === 'published') {
    query.status = filters.status;
  }
  if (filters.scope === 'mine') {
    query.teacherId = teacherId;
  }
  const term = (filters.q ?? '').trim().slice(0, 80);
  if (term) {
    const pattern = new RegExp(escapeRegExp(term), 'i');
    query.$or = [{ title: pattern }, { description: pattern }];
  }
  return query;
}

export async function listTeacherLessons(
  teacherId: string,
  filters: LessonListFilters = {}
): Promise<LessonCard[]> {
  const [lessons, materialCounts, exerciseCounts, submissionCounts] = await Promise.all([
    Lesson.find(buildLessonQuery(teacherId, filters)).sort({ updatedAt: -1 }).limit(500).lean(),
    LearningMaterial.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$lessonId', count: { $sum: 1 } } },
    ]),
    LearningExercise.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$lessonId', count: { $sum: 1 } } },
    ]),
    LearningSubmission.aggregate<{
      _id: Types.ObjectId;
      students: string[];
      count: number;
      pending: number;
    }>([
      {
        $group: {
          _id: '$lessonId',
          students: { $addToSet: '$studentId' },
          count: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  // Author names for the authorship column — resolved server-side from the
  // lesson documents, never from the client.
  const authorIds = [...new Set(lessons.map((lesson) => lesson.teacherId))];
  const authors = await User.find(
    { studentId: { $in: authorIds } },
    { studentId: 1, fullName: 1 }
  ).lean();
  const authorMap = new Map(authors.map((a) => [a.studentId, a.fullName]));

  const materialMap = new Map(materialCounts.map((c) => [c._id.toString(), c.count]));
  const exerciseMap = new Map(exerciseCounts.map((c) => [c._id.toString(), c.count]));
  const submissionMap = new Map(submissionCounts.map((c) => [c._id.toString(), c]));

  return lessons.map((lesson) => {
    const submissions = submissionMap.get(lesson._id.toString());
    return {
      id: lesson._id.toString(),
      title: lesson.title,
      description: lesson.description,
      status: lesson.status,
      publishedAt: lesson.publishedAt ? lesson.publishedAt.toISOString() : null,
      authorId: lesson.teacherId,
      authorName: authorMap.get(lesson.teacherId) ?? lesson.teacherId,
      isMine: lesson.teacherId === teacherId,
      materialCount: materialMap.get(lesson._id.toString()) ?? 0,
      exerciseCount: exerciseMap.get(lesson._id.toString()) ?? 0,
      studentCount: submissions ? new Set(submissions.students).size : 0,
      submissionCount: submissions?.count ?? 0,
      pendingCount: submissions?.pending ?? 0,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Teacher — bulk lesson management                                     */
/* ------------------------------------------------------------------ */

const MAX_BULK_LESSONS = 100;

function assertValidLessonIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_BULK_LESSONS) {
    throw new AppError(`Select between 1 and ${MAX_BULK_LESSONS} lessons.`, 400);
  }
  const ids = [...new Set(raw.map((id) => String(id ?? '')))].filter(Boolean);
  if (ids.length < 1) {
    throw new AppError('Select at least one lesson.', 400);
  }
  if (ids.some((id) => !Types.ObjectId.isValid(id))) {
    throw new AppError('One or more selected lessons are invalid.', 400);
  }
  return ids;
}

export interface BulkStatusResult {
  updated: number;
  message: string;
}

/** Publishes or unpublishes many lessons at once. */
export async function bulkSetLessonStatus(rawIds: unknown, status: unknown): Promise<BulkStatusResult> {
  if (status !== 'draft' && status !== 'published') {
    throw new AppError("Status must be 'draft' or 'published'.", 400);
  }
  const ids = assertValidLessonIds(rawIds);

  if (status === 'published') {
    const now = new Date();
    // publishedAt records the *first* publication and is preserved on
    // unpublish/republish, matching the single-lesson behavior.
    await Promise.all([
      Lesson.updateMany({ _id: { $in: ids }, publishedAt: null }, { publishedAt: now }),
      Lesson.updateMany({ _id: { $in: ids } }, { status: 'published' }),
    ]);
  } else {
    await Lesson.updateMany({ _id: { $in: ids } }, { status: 'draft' });
  }

  return {
    updated: ids.length,
    message:
      status === 'published'
        ? `${ids.length} lesson(s) published — students can see them now.`
        : `${ids.length} lesson(s) unpublished and hidden from students.`,
  };
}

export interface BulkDeleteResult {
  deleted: number;
  deletedSubmissions: number;
  /** Lessons with student submissions are preserved; the UI names them. */
  keptWithSubmissions: { id: string; title: string; submissionCount: number }[];
  message: string;
}

/**
 * Bulk permanent deletion, guarded against destroying graded student work.
 *
 * Any selected lesson that already has submissions is *kept* and reported
 * back instead of being deleted, so a mis-aimed "delete all" can never wipe
 * historical student records in one click. Such lessons can still be taken
 * out of the students' view with bulk unpublish, and an individual lesson can
 * be deleted deliberately from its own card.
 */
export async function bulkDeleteLessons(rawIds: unknown): Promise<BulkDeleteResult> {
  const ids = assertValidLessonIds(rawIds);
  const lessons = await Lesson.find({ _id: { $in: ids } }, { _id: 1, title: 1 }).lean();

  const counts = await LearningSubmission.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { lessonId: { $in: lessons.map((l) => l._id) } } },
    { $group: { _id: '$lessonId', count: { $sum: 1 } } },
  ]);
  const submissionMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  const keptWithSubmissions: BulkDeleteResult['keptWithSubmissions'] = [];
  const deletable: Types.ObjectId[] = [];
  for (const lesson of lessons) {
    const submissionCount = submissionMap.get(lesson._id.toString()) ?? 0;
    if (submissionCount > 0) {
      keptWithSubmissions.push({ id: lesson._id.toString(), title: lesson.title, submissionCount });
    } else {
      deletable.push(lesson._id);
    }
  }

  let deletedSubmissions = 0;
  for (const lessonId of deletable) {
    const result = await deleteLesson(lessonId.toString());
    deletedSubmissions += result.deletedSubmissions;
  }

  return {
    deleted: deletable.length,
    deletedSubmissions,
    keptWithSubmissions,
    message:
      keptWithSubmissions.length > 0
        ? `${deletable.length} lesson(s) deleted. ${keptWithSubmissions.length} kept because students already submitted work — unpublish them instead.`
        : `${deletable.length} lesson(s) deleted.`,
  };
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

function serializeMaterial(material: MaterialLike) {
  return {
    id: material._id.toString(),
    lessonId: material.lessonId.toString(),
    originalName: material.originalName,
    kind: material.kind,
    mimeType: material.mimeType,
    size: material.size,
    createdAt: material.createdAt.toISOString(),
  };
}

export async function addMaterial(
  teacherId: string,
  lessonId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
) {
  const lesson = await getLessonForAdmin(lessonId);
  const stored = await storageService.storeMaterial(file);
  const material = await LearningMaterial.create({
    lessonId: lesson._id,
    teacherId,
    originalName: stored.originalName,
    kind: stored.kind,
    mimeType: stored.mimeType,
    size: stored.size,
    gridFsFileId: stored.gridFsFileId,
  });
  return serializeMaterial(material);
}

export async function listMaterials(lessonId: string) {
  const lesson = await getLessonForAdmin(lessonId);
  const materials = await LearningMaterial.find({ lessonId: lesson._id }).sort({ createdAt: 1 }).lean();
  return materials.map(serializeMaterial);
}

export async function deleteMaterial(materialId: string) {
  assertValidObjectId(materialId, 'Material');
  const material = await LearningMaterial.findById(materialId).lean();
  if (!material) {
    throw new NotFoundError('Material not found.');
  }
  await storageService.deleteMaterialFile(material.gridFsFileId);
  await LearningMaterial.deleteOne({ _id: material._id });
  return { success: true, message: `"${material.originalName}" was removed.` };
}

/**
 * Loads a material for download/preview. Authorization rules:
 *  - an admin may always access it (the lesson set is shared — see the
 *    Authorization scope note above);
 *  - a student may access it only while the parent lesson is published.
 */
export async function getMaterialForAccess(identity: { id: string; studentId: string; role: string }, materialId: string) {
  assertValidObjectId(materialId, 'Material');
  const material = await LearningMaterial.findById(materialId).lean();
  if (!material) {
    throw new NotFoundError('Material not found.');
  }
  if (identity.role !== 'admin') {
    const lesson = await Lesson.findById(material.lessonId).lean();
    if (!lesson || lesson.status !== 'published') {
      // Same response for unpublished and missing lessons — never leaks
      // the existence of draft material to students.
      throw new NotFoundError('Material not found.');
    }
  }
  return material;
}

/* ------------------------------------------------------------------ */
/* Exercises                                                           */
/* ------------------------------------------------------------------ */

function assertValidQuestion(raw: unknown, index: number): ILearningQuestion {
  const q = (raw ?? {}) as Partial<ILearningQuestion>;
  if (!QUESTION_TYPES.includes(q.type as LearningQuestionType)) {
    throw new AppError(`Question ${index + 1}: unsupported question type.`, 400);
  }
  if (typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 600) {
    throw new AppError(`Question ${index + 1}: the prompt must be between 1 and 600 characters.`, 400);
  }
  const points = q.points === undefined ? 1 : Number(q.points);
  if (!Number.isInteger(points) || points < 1 || points > 100) {
    throw new AppError(`Question ${index + 1}: points must be an integer between 1 and 100.`, 400);
  }

  const clean: ILearningQuestion = {
    id: typeof q.id === 'string' && q.id ? q.id : crypto.randomUUID(),
    type: q.type as LearningQuestionType,
    prompt: q.prompt!.trim(),
    options: [],
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer.trim().slice(0, 600) : '',
    points,
  };

  if (clean.type === 'multiple_choice') {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      throw new AppError(`Question ${index + 1}: multiple choice needs between 2 and 6 options.`, 400);
    }
    clean.options = q.options.map((o) => String(o ?? '').trim().slice(0, 200));
    if (clean.options.some((o) => !o)) {
      throw new AppError(`Question ${index + 1}: multiple choice options cannot be empty.`, 400);
    }
    // Two identical choices make the question ambiguous — and a repeated option
    // text is also what produced duplicate React keys in the student view.
    if (new Set(clean.options).size !== clean.options.length) {
      throw new AppError(`Question ${index + 1}: multiple choice options must be unique.`, 400);
    }
    if (!clean.correctAnswer || !clean.options.includes(clean.correctAnswer)) {
      throw new AppError(`Question ${index + 1}: the correct answer must exactly match one of the options.`, 400);
    }
  }

  if (clean.type === 'fill_blank' && !clean.correctAnswer) {
    throw new AppError(`Question ${index + 1}: fill-in-the-blank questions need a correct answer.`, 400);
  }

  return clean;
}

function assertValidQuestions(rawQuestions: unknown): ILearningQuestion[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length < 1) {
    throw new AppError('An exercise needs at least one question.', 400);
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    throw new AppError(`An exercise can have at most ${MAX_QUESTIONS} questions.`, 400);
  }
  const questions = rawQuestions.map(assertValidQuestion);
  // Question ids are what submissions are keyed by (auto-grading, review,
  // student feedback). Duplicates would silently mismatch answers to
  // questions, so they are rejected rather than stored.
  if (new Set(questions.map((question) => question.id)).size !== questions.length) {
    throw new AppError('Question identifiers must be unique within an exercise.', 400);
  }
  return questions;
}

export function validateExerciseInput(body: unknown): { title: string; instructions: string; questions: ILearningQuestion[] } {
  const { title, instructions, questions } = (body ?? {}) as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    throw new AppError('Exercise title must be between 1 and 160 characters.', 400);
  }
  if (instructions !== undefined && instructions !== null) {
    if (typeof instructions !== 'string' || instructions.length > 600) {
      throw new AppError('Instructions must be at most 600 characters.', 400);
    }
  }
  return {
    title: title.trim(),
    instructions: typeof instructions === 'string' ? instructions.trim() : '',
    questions: assertValidQuestions(questions),
  };
}

export async function createExercise(teacherId: string, lessonId: string, body: unknown) {
  const lesson = await getLessonForAdmin(lessonId);
  const input = validateExerciseInput(body);
  const exercise = await LearningExercise.create({ lessonId: lesson._id, teacherId, ...input });
  return serialize(exercise.toObject());
}

export async function updateExercise(exerciseId: string, body: unknown) {
  const exercise = await getExerciseForAdmin(exerciseId);
  const input = validateExerciseInput(body);
  const updated = await LearningExercise.findByIdAndUpdate(exercise._id, input, { new: true }).lean();
  return serialize(updated!);
}

export async function deleteExercise(exerciseId: string) {
  const exercise = await getExerciseForAdmin(exerciseId);
  await Promise.all([
    LearningExercise.deleteOne({ _id: exercise._id }),
    LearningSubmission.deleteMany({ exerciseId: exercise._id }),
  ]);
  return { success: true, message: `Exercise "${exercise.title}" was deleted.` };
}

export async function listExercisesForTeacher(lessonId: string) {
  const lesson = await getLessonForAdmin(lessonId);
  const exercises = await LearningExercise.find({ lessonId: lesson._id }).sort({ createdAt: 1 }).lean();
  return exercises.map(serialize);
}

/**
 * One row of the teacher's Quiz Management table.
 *
 * A "quiz" in this product is an exercise attached to a lesson, so this view
 * is the cross-lesson projection of the same LearningExercise collection — it
 * does not introduce a second quiz model. The parent lesson's publication
 * status is surfaced because it is what makes a quiz visible to students.
 */
export interface QuizCard {
  id: string;
  title: string;
  instructions: string;
  lessonId: string;
  lessonTitle: string;
  lessonStatus: 'draft' | 'published';
  questionCount: number;
  totalPoints: number;
  submissionCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every quiz on the platform, newest first — the Quiz Management list.
 * Scoped and authorized the same way as the lesson library (see the
 * Authorization scope note): the /teacher/* routes are admin-only.
 */
export async function listQuizzesForTeacher(): Promise<QuizCard[]> {
  const [exercises, lessons, submissionAgg] = await Promise.all([
    LearningExercise.find({}).sort({ updatedAt: -1 }).limit(500).lean(),
    Lesson.find({}, { _id: 1, title: 1, status: 1 }).lean(),
    LearningSubmission.aggregate<{ _id: Types.ObjectId; count: number; pending: number }>([
      {
        $group: {
          _id: '$exerciseId',
          count: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const lessonMap = new Map(lessons.map((l) => [l._id.toString(), l]));
  const submissionMap = new Map(submissionAgg.map((c) => [c._id.toString(), c]));

  return exercises.map((exercise) => {
    const lesson = lessonMap.get(exercise.lessonId.toString());
    const submissions = submissionMap.get(exercise._id.toString());
    return {
      id: exercise._id.toString(),
      title: exercise.title,
      instructions: exercise.instructions,
      lessonId: exercise.lessonId.toString(),
      lessonTitle: lesson?.title ?? 'Unknown lesson',
      lessonStatus: (lesson?.status ?? 'draft') as 'draft' | 'published',
      questionCount: exercise.questions.length,
      totalPoints: exercise.questions.reduce((sum, q) => sum + q.points, 0),
      submissionCount: submissions?.count ?? 0,
      pendingCount: submissions?.pending ?? 0,
      createdAt: exercise.createdAt.toISOString(),
      updatedAt: exercise.updatedAt.toISOString(),
    };
  });
}

/** Student-facing exercise: never exposes correct answers. */
export function stripAnswers(exercise: { _id: Types.ObjectId; title: string; instructions: string; questions: ILearningQuestion[] }) {
  return {
    id: exercise._id.toString(),
    title: exercise.title,
    instructions: exercise.instructions,
    questions: exercise.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

function autoGrade(
  question: ILearningQuestion,
  answer: string
): { autoCorrect: boolean | null; earnedPoints: number } {
  if (question.type === 'short_answer') {
    // Graded by the teacher during review.
    return { autoCorrect: null, earnedPoints: 0 };
  }
  if (!answer.trim()) {
    return { autoCorrect: false, earnedPoints: 0 };
  }
  if (question.type === 'multiple_choice') {
    const correct = answer.trim() === question.correctAnswer;
    return { autoCorrect: correct, earnedPoints: correct ? question.points : 0 };
  }
  // fill_blank — punctuation/case-insensitive match.
  const correct = normalizeForComparison(answer) === normalizeForComparison(question.correctAnswer);
  return { autoCorrect: correct, earnedPoints: correct ? question.points : 0 };
}

export async function submitAnswers(
  studentId: string,
  lessonId: string,
  exerciseId: string,
  rawAnswers: unknown
) {
  assertValidObjectId(lessonId, 'Lesson');
  assertValidObjectId(exerciseId, 'Exercise');

  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson || lesson.status !== 'published') {
    throw new NotFoundError('Lesson not found.');
  }
  const exercise = await LearningExercise.findOne({ _id: exerciseId, lessonId: lesson._id }).lean();
  if (!exercise) {
    throw new NotFoundError('Exercise not found.');
  }

  const existing = await LearningSubmission.exists({ studentId, exerciseId: exercise._id });
  if (existing) {
    throw new ConflictError(
      'You have already submitted this exercise. Resubmission is not available for this assignment.'
    );
  }

  if (!Array.isArray(rawAnswers)) {
    throw new AppError('Answers must be a list.', 400);
  }

  const questionMap = new Map(exercise.questions.map((q) => [q.id, q]));
  const answers = rawAnswers.map((raw) => {
    const { questionId, answer } = (raw ?? {}) as { questionId?: unknown; answer?: unknown };
    if (typeof questionId !== 'string' || !questionMap.has(questionId)) {
      throw new AppError('Submission contains a question that does not belong to this exercise.', 400);
    }
    if (typeof answer !== 'string' || answer.length > 2000) {
      throw new AppError('Answers must be strings of at most 2000 characters.', 400);
    }
    const question = questionMap.get(questionId)!;
    const graded = autoGrade(question, answer);
    return {
      questionId,
      type: question.type,
      promptSnapshot: question.prompt,
      answer,
      autoCorrect: graded.autoCorrect,
      earnedPoints: graded.earnedPoints,
      maxPoints: question.points,
    };
  });

  // Unanswered questions are stored as empty answers so the teacher's review
  // view shows the full exercise, not just the answered subset.
  for (const question of exercise.questions) {
    if (!answers.some((a) => a.questionId === question.id)) {
      answers.push({
        questionId: question.id,
        type: question.type,
        promptSnapshot: question.prompt,
        answer: '',
        autoCorrect: question.type === 'short_answer' ? null : false,
        earnedPoints: 0,
        maxPoints: question.points,
      });
    }
  }

  const autoScore = answers.reduce((sum, a) => sum + a.earnedPoints, 0);
  const totalPoints = answers.reduce((sum, a) => sum + a.maxPoints, 0);

  try {
    const submission = await LearningSubmission.create({
      studentId,
      lessonId: lesson._id,
      exerciseId: exercise._id,
      lessonTitle: lesson.title,
      exerciseTitle: exercise.title,
      answers,
      autoScore,
      totalPoints,
      status: 'submitted',
    });
    return serialize(submission.toObject());
  } catch (err) {
    // Race with a concurrent submit: the unique (studentId, exerciseId)
    // index is the final authority against duplicate submissions.
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError('You have already submitted this exercise.');
    }
    throw err;
  }
}

/**
 * Every student submission on the platform, newest first.
 *
 * Deliberately not narrowed by lesson authorship — that filter is precisely
 * what made a real submission invisible to every admin (see the Authorization
 * scope note). `lessonId` may narrow the list for the review center's lesson
 * filter, and is validated as an existing lesson before it is used.
 */
export async function listSubmissionsForTeacher(lessonId?: string) {
  const query: { lessonId?: Types.ObjectId } = {};
  if (lessonId) {
    const lesson = await getLessonForAdmin(lessonId);
    query.lessonId = lesson._id;
  }
  const submissions = await LearningSubmission.find(query)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  // Attach student names in one query — derived server-side.
  const studentIds = [...new Set(submissions.map((s) => s.studentId))];
  const students = await User.find({ studentId: { $in: studentIds } }, { studentId: 1, fullName: 1 }).lean();
  const nameMap = new Map(students.map((s) => [s.studentId, s.fullName]));
  return submissions.map((s) => ({
    id: s._id.toString(),
    studentId: s.studentId,
    studentName: nameMap.get(s.studentId) ?? s.studentId,
    lessonId: s.lessonId.toString(),
    lessonTitle: s.lessonTitle,
    exerciseId: s.exerciseId.toString(),
    exerciseTitle: s.exerciseTitle,
    status: s.status,
    autoScore: s.autoScore,
    totalPoints: s.totalPoints,
    teacherScore: s.teacherScore,
    submittedAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
  }));
}

function serializeSubmissionDetail(s: SubmissionLike) {
  return {
    id: s._id.toString(),
    studentId: s.studentId,
    lessonId: s.lessonId.toString(),
    lessonTitle: s.lessonTitle,
    exerciseId: s.exerciseId.toString(),
    exerciseTitle: s.exerciseTitle,
    status: s.status,
    autoScore: s.autoScore,
    totalPoints: s.totalPoints,
    teacherScore: s.teacherScore,
    teacherFeedback: s.teacherFeedback,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    submittedAt: s.createdAt.toISOString(),
    answers: s.answers.map((a) => ({
      questionId: a.questionId,
      type: a.type,
      prompt: a.promptSnapshot,
      answer: a.answer,
      autoCorrect: a.autoCorrect,
      earnedPoints: a.earnedPoints,
      maxPoints: a.maxPoints,
    })),
  };
}

export async function getSubmissionForTeacher(submissionId: string) {
  assertValidObjectId(submissionId, 'Submission');
  const submission = await LearningSubmission.findById(submissionId).lean();
  if (!submission) {
    throw new NotFoundError('Submission not found.');
  }
  // Integrity check only: the submission must point at a lesson that still
  // exists. Which admin may review it is a role decision made on the route
  // (see the Authorization scope note), not a lesson-authorship comparison —
  // that comparison returned 403 for submissions the review center listed.
  const lesson = await Lesson.findById(submission.lessonId).lean();
  if (!lesson) {
    throw new NotFoundError('The lesson this submission belongs to no longer exists.');
  }
  // Correct answers come from the stored exercise, keyed by question id, so
  // the review UI can show them next to the student's answers. Teachers only.
  const exercise = await LearningExercise.findById(submission.exerciseId).lean();
  const correctAnswers: Record<string, string> = {};
  for (const q of exercise?.questions ?? []) {
    correctAnswers[q.id] = q.correctAnswer;
  }
  return { ...serializeSubmissionDetail(submission), correctAnswers };
}

export async function reviewSubmission(
  submissionId: string,
  body: { score: unknown; feedback: unknown }
) {
  const submission = await getSubmissionForTeacher(submissionId);
  const { score, feedback } = body ?? ({} as { score: unknown; feedback: unknown });
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
    throw new AppError('Score must be a number between 0 and 100.', 400);
  }
  if (feedback !== undefined && feedback !== null) {
    if (typeof feedback !== 'string' || feedback.length > 2000) {
      throw new AppError('Feedback must be at most 2000 characters.', 400);
    }
  }
  const updated = await LearningSubmission.findByIdAndUpdate(
    submission.id,
    {
      status: 'reviewed',
      teacherScore: score,
      teacherFeedback: typeof feedback === 'string' ? feedback.trim() : '',
      reviewedAt: new Date(),
    },
    { new: true }
  ).lean();
  return serializeSubmissionDetail(updated!);
}

export async function listMySubmissions(studentId: string) {
  const submissions = await LearningSubmission.find({ studentId }).sort({ createdAt: -1 }).limit(200).lean();
  return submissions.map((s) => ({
    id: s._id.toString(),
    lessonId: s.lessonId.toString(),
    lessonTitle: s.lessonTitle,
    exerciseId: s.exerciseId.toString(),
    exerciseTitle: s.exerciseTitle,
    status: s.status,
    autoScore: s.autoScore,
    totalPoints: s.totalPoints,
    teacherScore: s.teacherScore,
    teacherFeedback: s.teacherFeedback,
    submittedAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    answers: s.answers.map((a) => ({
      questionId: a.questionId,
      type: a.type,
      prompt: a.promptSnapshot,
      answer: a.answer,
      autoCorrect: a.autoCorrect,
      earnedPoints: a.earnedPoints,
      maxPoints: a.maxPoints,
    })),
  }));
}

/* ------------------------------------------------------------------ */
/* Student views                                                       */
/* ------------------------------------------------------------------ */

export async function listPublishedLessons(studentId: string) {
  const [lessons, materialCounts, exerciseCounts, mySubmissions] = await Promise.all([
    Lesson.find({ status: 'published' }).sort({ publishedAt: -1 }).lean(),
    LearningMaterial.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$lessonId', count: { $sum: 1 } } },
    ]),
    LearningExercise.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$lessonId', count: { $sum: 1 } } },
    ]),
    LearningSubmission.find({ studentId }, { lessonId: 1, status: 1 }).lean(),
  ]);

  const materialMap = new Map(materialCounts.map((c) => [c._id.toString(), c.count]));
  const exerciseMap = new Map(exerciseCounts.map((c) => [c._id.toString(), c.count]));
  const submissionMap = new Map<string, string>();
  for (const s of mySubmissions) {
    const key = s.lessonId.toString();
    // A lesson is "reviewed" only if every submission in it was reviewed.
    if (!submissionMap.has(key) || (submissionMap.get(key) === 'submitted' && s.status === 'reviewed')) {
      submissionMap.set(key, s.status);
    }
  }

  return lessons.map((lesson) => ({
    id: lesson._id.toString(),
    title: lesson.title,
    description: lesson.description,
    publishedAt: lesson.publishedAt ? lesson.publishedAt.toISOString() : null,
    materialCount: materialMap.get(lesson._id.toString()) ?? 0,
    exerciseCount: exerciseMap.get(lesson._id.toString()) ?? 0,
    myStatus: submissionMap.get(lesson._id.toString()) ?? 'not_submitted',
  }));
}

export async function getStudentLesson(studentId: string, lessonId: string) {
  assertValidObjectId(lessonId, 'Lesson');
  const lesson = await Lesson.findOne({ _id: lessonId, status: 'published' }).lean();
  if (!lesson) {
    throw new NotFoundError('Lesson not found.');
  }
  const [materials, exercises, mySubmissions] = await Promise.all([
    LearningMaterial.find({ lessonId: lesson._id }).sort({ createdAt: 1 }).lean(),
    LearningExercise.find({ lessonId: lesson._id }).sort({ createdAt: 1 }).lean(),
    LearningSubmission.find({ studentId, lessonId: lesson._id }).lean(),
  ]);

  const submissionByExercise = new Map(mySubmissions.map((s) => [s.exerciseId.toString(), s]));

  return {
    lesson: {
      id: lesson._id.toString(),
      title: lesson.title,
      description: lesson.description,
      publishedAt: lesson.publishedAt ? lesson.publishedAt.toISOString() : null,
    },
    materials: materials.map(serializeMaterial),
    exercises: exercises.map(stripAnswers),
    submissions: exercises
      .map((e) => {
        const s = submissionByExercise.get(e._id.toString());
        return s
          ? {
              exerciseId: e._id.toString(),
              status: s.status,
              autoScore: s.autoScore,
              totalPoints: s.totalPoints,
              teacherScore: s.teacherScore,
              teacherFeedback: s.teacherFeedback,
              submittedAt: s.createdAt.toISOString(),
            }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
  };
}

export async function getStudentProgress(studentId: string) {
  const [publishedCount, submissionAgg] = await Promise.all([
    Lesson.countDocuments({ status: 'published' }),
    LearningSubmission.aggregate<{
      lessons: number;
      exercises: number;
      reviewedScores: number[];
    }>([
      { $match: { studentId } },
      {
        $group: {
          _id: null,
          lessons: { $addToSet: '$lessonId' },
          exercises: { $addToSet: '$exerciseId' },
          reviewedScores: {
            $push: { $cond: [{ $eq: ['$status', 'reviewed'] }, '$teacherScore', '$$REMOVE'] },
          },
        },
      },
      {
        $project: {
          lessons: { $size: '$lessons' },
          exercises: { $size: '$exercises' },
          reviewedScores: 1,
        },
      },
    ]),
  ]);

  const agg = submissionAgg[0];
  const reviewedScores = (agg?.reviewedScores ?? []).filter(
    (s): s is number => typeof s === 'number'
  );
  const averageScore =
    reviewedScores.length > 0
      ? Math.round(reviewedScores.reduce((a, b) => a + b, 0) / reviewedScores.length)
      : null;

  return {
    lessonsCompleted: agg?.lessons ?? 0,
    lessonsTotal: publishedCount,
    exercisesCompleted: agg?.exercises ?? 0,
    averageScore,
  };
}

/* ------------------------------------------------------------------ */
/* Teacher overview                                                    */
/* ------------------------------------------------------------------ */

export async function getTeacherOverview(teacherId: string) {
  // Counts describe the whole lesson set the admin is responsible for. They
  // used to mix scopes — lessons counted by authorship while submissions
  // counted platform-wide — which is what made the dashboard advertise
  // "Pending Reviews: N" next to an empty submissions list (see the
  // Authorization scope note). Every figure below now matches the list it
  // links to.
  const [totalLessons, publishedLessons, myLessons, totalStudents, pendingSubmissions, totalSubmissions, completionAgg] =
    await Promise.all([
      Lesson.countDocuments({}),
      Lesson.countDocuments({ status: 'published' }),
      Lesson.countDocuments({ teacherId }),
      User.countDocuments({ role: 'student' }),
      LearningSubmission.countDocuments({ status: 'submitted' }),
      LearningSubmission.countDocuments({}),
      // Average completion = (student, lesson) submission pairs over the
      // potential pool of published-lesson × enrolled students. Computed
      // self-contained (its own student count) so it never references a
      // sibling Promise.all result during initialization.
      (async () => {
        const [published, students] = await Promise.all([
          Lesson.find({ status: 'published' }, { _id: 1 }).lean(),
          User.countDocuments({ role: 'student' }),
        ]);
        if (published.length === 0 || students === 0) return 0;
        const pairs = await LearningSubmission.aggregate<{ n: number }>([
          { $match: { lessonId: { $in: published.map((l) => l._id) } } },
          { $group: { _id: { s: '$studentId', l: '$lessonId' } } },
          { $count: 'n' },
        ]);
        const potential = published.length * students;
        return potential > 0 ? Math.round(((pairs[0]?.n ?? 0) / potential) * 100) : 0;
      })(),
    ]);

  return {
    totalLessons,
    publishedLessons,
    /** How many of the visible lessons this admin authored. */
    myLessons,
    totalStudents,
    pendingSubmissions,
    totalSubmissions,
    averageCompletion: completionAgg,
  };
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export function validateAnnouncementInput(body: unknown): { title: string; body: string } {
  const { title, body: message } = (body ?? {}) as { title?: unknown; body?: unknown };
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
    throw new AppError('Announcement title must be between 1 and 160 characters.', 400);
  }
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
    throw new AppError('Announcement body must be between 1 and 2000 characters.', 400);
  }
  return { title: title.trim(), body: message.trim() };
}

export async function createAnnouncement(teacherId: string, body: unknown) {
  const input = validateAnnouncementInput(body);
  const announcement = await Announcement.create({ teacherId, ...input });
  return serialize(announcement.toObject());
}

export async function listAnnouncements() {
  const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20).lean();
  return announcements.map((a) => ({
    id: a._id.toString(),
    teacherId: a.teacherId,
    title: a.title,
    body: a.body,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function deleteAnnouncement(teacherId: string, announcementId: string) {
  assertValidObjectId(announcementId, 'Announcement');
  const deleted = await Announcement.findOneAndDelete({ _id: announcementId, teacherId }).lean();
  if (!deleted) {
    throw new NotFoundError('Announcement not found.');
  }
  return { success: true, message: 'Announcement deleted.' };
}
