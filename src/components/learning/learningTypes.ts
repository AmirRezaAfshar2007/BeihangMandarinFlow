/**
 * Shared types for the Learning Hub frontend. Mirrors the JSON shapes
 * produced by src/services/learning.service.ts — keep both in sync.
 */

export type QuestionType = 'short_answer' | 'multiple_choice' | 'fill_blank';

export interface LearningTeacherOverview {
  totalLessons: number;
  publishedLessons: number;
  /** Lessons authored by the signed-in admin (the set is shared — see scope). */
  myLessons: number;
  totalStudents: number;
  pendingSubmissions: number;
  totalSubmissions: number;
  averageCompletion: number;
}

export interface LearningLessonCard {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  authorId: string;
  authorName: string;
  isMine: boolean;
  materialCount: number;
  exerciseCount: number;
  studentCount: number;
  submissionCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Query filters accepted by GET /api/learning/teacher/lessons. */
export interface LessonListFilters {
  q?: string;
  status?: 'all' | 'draft' | 'published';
  scope?: 'all' | 'mine';
}

export interface BulkLessonStatusResult {
  updated: number;
  message: string;
}

export interface BulkLessonDeleteResult {
  deleted: number;
  deletedSubmissions: number;
  keptWithSubmissions: { id: string; title: string; submissionCount: number }[];
  message: string;
}

export interface LearningMaterial {
  id: string;
  lessonId: string;
  originalName: string;
  kind: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface LearningExercise {
  id: string;
  lessonId?: string;
  title: string;
  instructions: string;
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    options: string[];
    correctAnswer: string;
    points: number;
  }[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * One row of the teacher's Quiz Management table. A quiz is an exercise
 * attached to a lesson; the parent lesson's status is what gates visibility
 * to students.
 */
export interface LearningQuizCard {
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

export interface LearningAIDraft {
  title: string;
  instructions: string;
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    options: string[];
    correctAnswer: string;
    points: number;
  }[];
  aiMeta: { topic: string; difficulty: string; requested: number; generated: number };
}

export interface LearningSubmissionSummary {
  id: string;
  studentId: string;
  studentName?: string;
  lessonId: string;
  lessonTitle: string;
  exerciseId: string;
  exerciseTitle: string;
  status: 'submitted' | 'reviewed';
  autoScore: number;
  totalPoints: number;
  teacherScore: number | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface LearningSubmissionDetail {
  id: string;
  studentId: string;
  studentName?: string;
  lessonId: string;
  lessonTitle: string;
  exerciseId: string;
  exerciseTitle: string;
  status: 'submitted' | 'reviewed';
  autoScore: number;
  totalPoints: number;
  teacherScore: number | null;
  teacherFeedback: string;
  reviewedAt: string | null;
  submittedAt: string;
  answers: {
    questionId: string;
    type: QuestionType;
    prompt: string;
    answer: string;
    autoCorrect: boolean | null;
    earnedPoints: number;
    maxPoints: number;
  }[];
  /** Teacher-only: correct answers keyed by questionId. */
  correctAnswers?: Record<string, string>;
}

export interface LearningAnnouncement {
  id: string;
  teacherId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface LearningStudentLessonCard {
  id: string;
  title: string;
  description: string;
  publishedAt: string | null;
  materialCount: number;
  exerciseCount: number;
  myStatus: 'not_submitted' | 'submitted' | 'reviewed';
}

export interface LearningStudentLesson {
  lesson: { id: string; title: string; description: string; publishedAt: string | null };
  materials: LearningMaterial[];
  exercises: {
    id: string;
    title: string;
    instructions: string;
    questions: {
      id: string;
      type: QuestionType;
      prompt: string;
      options: string[];
      points: number;
    }[];
  }[];
  submissions: {
    exerciseId: string;
    status: 'submitted' | 'reviewed';
    autoScore: number;
    totalPoints: number;
    teacherScore: number | null;
    teacherFeedback: string;
    submittedAt: string;
  }[];
}

export interface LearningStudentProgress {
  lessonsCompleted: number;
  lessonsTotal: number;
  exercisesCompleted: number;
  averageScore: number | null;
}

export interface LearningMaterialDTO {
  id: string;
  lessonId: string;
  originalName: string;
  kind: string; // pdf | ppt | pptx | doc | docx
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface LessonCardDTO {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  materialCount: number;
  exerciseCount: number;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentLessonCardDTO {
  id: string;
  title: string;
  description: string;
  publishedAt: string | null;
  materialCount: number;
  exerciseCount: number;
  myStatus: 'not_submitted' | 'submitted' | 'reviewed';
}

export interface ExerciseQuestionDTO {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  points: number;
  // Teacher-only fields (present when editing; stripped for students):
  correctAnswer?: string;
}

export interface ExerciseDTO {
  id: string;
  lessonId?: string;
  title: string;
  instructions: string;
  questions: ExerciseQuestionDTO[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SubmissionAnswerDTO {
  questionId: string;
  type: QuestionType;
  prompt: string;
  answer: string;
  autoCorrect: boolean | null;
  earnedPoints: number;
  maxPoints: number;
}

export interface SubmissionSummaryDTO {
  id: string;
  studentId: string;
  studentName?: string;
  lessonId: string;
  lessonTitle: string;
  exerciseId: string;
  exerciseTitle: string;
  status: 'submitted' | 'reviewed';
  autoScore: number;
  totalPoints: number;
  teacherScore: number | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface SubmissionDetailDTO extends SubmissionSummaryDTO {
  teacherFeedback: string;
  answers: SubmissionAnswerDTO[];
}

export interface TeacherOverviewDTO {
  totalLessons: number;
  publishedLessons: number;
  myLessons: number;
  totalStudents: number;
  pendingSubmissions: number;
  totalSubmissions: number;
  averageCompletion: number;
}

export interface StudentProgressDTO {
  lessonsCompleted: number;
  lessonsTotal: number;
  exercisesCompleted: number;
  averageScore: number | null;
}

export interface AnnouncementDTO {
  id: string;
  teacherId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AIDraftExerciseDTO {
  title: string;
  instructions: string;
  questions: ExerciseQuestionDTO[];
  aiMeta: { topic: string; difficulty: string; requested: number; generated: number };
}

export interface HubUser {
  studentId: string;
  fullName: string;
  role: 'admin' | 'student';
}
