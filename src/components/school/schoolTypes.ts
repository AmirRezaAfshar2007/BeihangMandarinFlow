/**
 * Shared types for the School section frontend. Mirrors the JSON shapes
 * produced by src/services/school.service.ts — keep both in sync.
 */

export type VoiceAssignmentStatus = 'draft' | 'published';
export type VoiceSubmissionStatus = 'submitted' | 'reviewed';
export type StudentAssignmentStatus = 'not_submitted' | VoiceSubmissionStatus;

export interface VoiceSentence {
  id: string;
  text: string;
}

export interface VoiceAudioMeta {
  mimeType: string;
  size: number;
  durationSeconds: number;
}

/** Payload accepted by create/update — mirrors validateVoiceAssignmentInput. */
export interface VoiceAssignmentInput {
  title: string;
  instructions: string;
  sentences: VoiceSentence[];
  dueDate: string | null;
}

export interface SchoolOverview {
  totalAssignments: number;
  publishedAssignments: number;
  myAssignments: number;
  totalStudents: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  reviewedSubmissions: number;
}

export interface TeacherVoiceAssignment {
  id: string;
  teacherId: string;
  teacherName: string;
  isMine: boolean;
  title: string;
  instructions: string;
  sentences: VoiceSentence[];
  sentenceCount: number;
  status: VoiceAssignmentStatus;
  publishedAt: string | null;
  dueDate: string | null;
  submissionCount: number;
  pendingCount: number;
  reviewedCount: number;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherVoiceSubmission {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  status: VoiceSubmissionStatus;
  submissionCount: number;
  teacherScore: number | null;
  teacherFeedback: string;
  submittedAt: string;
  reviewedAt: string | null;
  audio: VoiceAudioMeta;
  sentenceCount: number;
}

export interface TeacherVoiceSubmissionDetail {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  sentences: VoiceSentence[];
  status: VoiceSubmissionStatus;
  submissionCount: number;
  teacherScore: number | null;
  teacherFeedback: string;
  submittedAt: string;
  reviewedAt: string | null;
  audio: VoiceAudioMeta;
}

/** Student's own submission, as returned inside the assignment detail. */
export interface StudentVoiceSubmission {
  id: string;
  status: VoiceSubmissionStatus;
  submissionCount: number;
  teacherScore: number | null;
  teacherFeedback: string;
  submittedAt: string;
  reviewedAt: string | null;
  audio: VoiceAudioMeta;
}

export interface StudentVoiceAssignmentSummary {
  id: string;
  title: string;
  instructions: string;
  sentences: VoiceSentence[];
  sentenceCount: number;
  publishedAt: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  myStatus: StudentAssignmentStatus;
  myScore: number | null;
}

export interface StudentVoiceAssignmentDetail {
  id: string;
  title: string;
  instructions: string;
  sentences: VoiceSentence[];
  publishedAt: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  submission: StudentVoiceSubmission | null;
}

export interface VoiceSubmitResult {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  status: VoiceSubmissionStatus;
  submissionCount: number;
  teacherScore: number | null;
  teacherFeedback: string;
  submittedAt: string;
  reviewedAt: string | null;
  audio: VoiceAudioMeta;
  replaced: boolean;
}
