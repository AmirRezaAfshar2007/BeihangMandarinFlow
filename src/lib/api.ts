import { 
  Student, 
  CharacterItem, 
  PracticeLog, 
  StudentStats, 
  Achievement,
  Folder,
  SpeakingChallenge,
  SpeakingAttempt,
  SpeakingDifficulty
} from '../types.ts';
import type {
  HomeFeedbackChoice,
  HomeFeedbackStats,
  HomeFeedbackSubmission,
  HomeFeedbackTotals,
  HomePublicData,
} from '../components/home/homeTypes.ts';
import type {
  SchoolOverview,
  TeacherVoiceAssignment,
  TeacherVoiceSubmission,
  TeacherVoiceSubmissionDetail,
  StudentVoiceAssignmentSummary,
  StudentVoiceAssignmentDetail,
  VoiceAssignmentInput,
  VoiceSubmitResult,
} from '../components/school/schoolTypes.ts';
import type {
  LearningTeacherOverview,
  LearningLessonCard,
  LearningQuizCard,
  LearningMaterial,
  LearningExercise,
  LearningAIDraft,
  LearningSubmissionSummary,
  LearningSubmissionDetail,
  LearningAnnouncement,
  LearningStudentLessonCard,
  LearningStudentLesson,
  LearningStudentProgress,
  LessonListFilters,
  BulkLessonStatusResult,
  BulkLessonDeleteResult,
} from '../components/learning/learningTypes.ts';

const BASE_URL = import.meta.env.VITE_API_URL || '';

let jwtToken = localStorage.getItem('sino3d_token');

export function setToken(token: string | null) {
  jwtToken = token;
  if (token) {
    localStorage.setItem('sino3d_token', token);
  } else {
    localStorage.removeItem('sino3d_token');
  }
}

export function getToken() {
  return jwtToken;
}

export function isAuthenticated() {
  return !!jwtToken;
}

function getHeaders() {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  /** Pass `isPublic` for endpoints that are reachable without a session: a
   *  rejection there is reported to the caller as a normal error instead of
   *  being read as "the session expired". */
  { isPublic = false }: { isPublic?: boolean } = {}
): Promise<T> {
  // A 401 only means "your session is gone" when the request was actually
  // made with a session. Anonymous calls — the public landing page and
  // anything else reachable without a token — must never clear state or fire
  // the global `unauthorized` redirect: doing so would yank a visitor off a
  // public page and back to the login screen the moment any of its requests
  // is rejected.
  const carriedToken = !!jwtToken && !isPublic;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  let data: any = null;
  if (isJson) {
    try {
      data = await response.json();
    } catch (err) {
      console.error('Failed to parse JSON response:', err);
    }
  }

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && carriedToken) {
      setToken(null);
      localStorage.removeItem('sino3d_token');
      window.dispatchEvent(new Event('unauthorized'));
    }
    const textError = !isJson ? await response.text().catch(() => '') : '';
    const errorMessage = data?.error || (textError ? `Error ${response.status}: ${textError.substring(0, 100)}` : `Request failed with status ${response.status}`);
    throw new Error(errorMessage);
  }

  if (!isJson) {
    throw new Error(`Invalid response format from server (expected JSON, got ${contentType || 'unknown'})`);
  }

  return data as T;
}

export const api = {
  setToken,
  getToken,
  isAuthenticated,

  // Auth
  async login(studentId: string, password: string) {
    const data = await request<{ token: string; user: { studentId: string; fullName: string; role: 'admin' | 'student' } }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ studentId, password }),
      }
    );
    setToken(data.token);
    return data.user;
  },

  /**
   * Public self-service sign-up. Disabled server-side unless
   * ALLOW_SELF_REGISTRATION is on (see src/lib/features.ts and env.ts).
   */
  async register(studentId: string, fullName: string, password: string) {
    const data = await request<{ token: string; user: { studentId: string; fullName: string; role: 'admin' | 'student' } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ studentId, fullName, password }),
      }
    );
    setToken(data.token);
    return data.user;
  },

  /**
   * Admin-only account creation. Deliberately not `register` — that one signs
   * the new account in, which would swap the signed-in administrator's token
   * out for the brand-new student's.
   */
  async adminCreateStudent(studentId: string, fullName: string, password: string) {
    return request<{
      success: boolean;
      user: { studentId: string; fullName: string; role: 'admin' | 'student' };
      message: string;
    }>('/api/admin/students', {
      method: 'POST',
      body: JSON.stringify({ studentId, fullName, password }),
    });
  },

  async forgotPassword(studentId: string, fullName: string, newPassword: string) {
    return request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ studentId, fullName, newPassword }),
    });
  },

  async getMe() {
    return request<{ user: { id: string; studentId: string; fullName: string; role: 'admin' | 'student' } }>(
      '/api/auth/me'
    );
  },

  async logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (err: any) {
      console.error('Logout API request failed:', err);
    }
    
    try {
      setToken(null);
    } catch (e) {
      console.warn('Could not clear token state:', e);
    }

    try {
      localStorage.removeItem('sino3d_token');
    } catch (e) {
      console.warn('Could not remove sino3d_token from localStorage:', e);
    }

    try {
      localStorage.clear();
    } catch (e) {
      console.warn('Could not clear localStorage:', e);
    }

    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear sessionStorage:', e);
    }

    try {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax;Secure";
      }
    } catch (e) {
      console.warn('Could not clear cookies:', e);
    }
  },

  // Characters
  async getCharacters() {
    return request<CharacterItem[]>('/api/characters');
  },

  async addCharacter(character: string, folderId?: string | null) {
    return request<CharacterItem>('/api/characters/add', {
      method: 'POST',
      body: JSON.stringify({ character, folderId: folderId ?? null }),
    });
  },

  async deleteCharacter(charId: string) {
    return request<{ success: boolean; message: string }>(`/api/characters/${charId}`, {
      method: 'DELETE',
    });
  },

  async getCharacterUsage() {
    return request<{ used: number; limit: number; remaining: number }>(
      '/api/characters/usage'
    );
  },

  // Folders
  async getFolders() {
    return request<Folder[]>('/api/folders');
  },

  async createFolder(data: {
    name: string;
    description?: string;
    category?: string;
    color?: string;
    icon?: string;
    customDate?: string | null;
  }) {
    return request<Folder>('/api/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFolder(
    folderId: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      color: string;
      icon: string;
      isFavorite: boolean;
      customDate: string | null;
    }>
  ) {
    return request<Folder>(`/api/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteFolder(folderId: string) {
    return request<{ success: boolean; message: string }>(`/api/folders/${folderId}`, {
      method: 'DELETE',
    });
  },

  async assignCharacterToFolder(characterId: string, folderId: string | null) {
    return request<CharacterItem>('/api/folders/assign', {
      method: 'POST',
      body: JSON.stringify({ characterId, folderId }),
    });
  },

  // AI Speaking Coach
  async getSpeakingChallenge(difficulty: SpeakingDifficulty) {
    return request<SpeakingChallenge>(`/api/speaking/challenge?difficulty=${difficulty}`);
  },

  async analyzeSpeaking(data: {
    audioBase64: string;
    mimeType: string;
    challengePrompt: string;
    difficulty: SpeakingDifficulty;
    durationSeconds: number;
  }) {
    return request<SpeakingAttempt>('/api/speaking/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Powers the live caption shown while the user is still recording (before
  // Submit). Called repeatedly with the audio captured so far; see the
  // comment on speaking.service.ts's transcribeChunk for why this replaced
  // the browser's built-in Web Speech API for this feature.
  async transcribeSpeakingChunk(data: { audioBase64: string; mimeType: string }) {
    return request<{ transcript: string }>('/api/speaking/transcribe-chunk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSpeakingHistory(limit = 50) {
    return request<SpeakingAttempt[]>(`/api/speaking/history?limit=${limit}`);
  },

  async getSpeakingUsage() {
    return request<{ used: number; limit: number; remaining: number; resetsAt: string }>(
      '/api/speaking/usage'
    );
  },

  // Practice & SRS
  async logPractice(characterId: string, quizMode: string, score: number, durationSeconds?: number) {
    return request<{
      success: boolean;
      character: CharacterItem;
      log: PracticeLog;
      awardedXp: number;
      newUnlockedAchievements: Achievement[];
    }>('/api/practice/log', {
      method: 'POST',
      body: JSON.stringify({ characterId, quizMode, score, durationSeconds }),
    });
  },

  // Stats
  async getStats() {
    return request<{
      studentId: string;
      fullName: string;
      stats: StudentStats;
      totalCharacters: number;
      masteredCharacters: number;
      charactersToReview: number;
      averageAccuracy: number;
      achievements: Achievement[];
      practiceLogCount: number;
      recentPracticeLogs: PracticeLog[];
    }>('/api/stats');
  },

  // Admin Panel
  async getAdminOverview() {
    return request<{
      students: (Student & { stats: StudentStats; deckCount: number })[];
      overview: {
        totalUsers: number;
        totalCharactersLoaded: number;
        totalPracticeLogsRecorded: number;
      };
    }>('/api/admin/overview');
  },

  async adminResetPassword(studentId: string, newPassword: string) {
    return request<{ success: boolean; message: string }>('/api/admin/students/reset-password', {
      method: 'POST',
      body: JSON.stringify({ studentId, newPassword }),
    });
  },

  async adminToggleStatus(studentId: string) {
    return request<{ success: boolean; disabled: boolean; message: string }>('/api/admin/students/toggle-status', {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    });
  },

  async adminDeleteStudent(studentId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/students/${studentId}`, {
      method: 'DELETE',
    });
  },

  async adminBroadcastFolder(payload: {
    folderName: string;
    description?: string;
    category?: string;
    color?: string;
    icon?: string;
    charactersText: string;
  }) {
    return request<{
      success: boolean;
      message: string;
      studentsAffected: number;
      charactersResolved: number;
      charactersAddedTotal: number;
      alreadyOwnedSkips: number;
      lookupFailures: string[];
      invalidEntries: string[];
    }>('/api/admin/broadcast-folder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /* ----------------------------------------------------------------
   * Learning Hub
   * -------------------------------------------------------------- */

  // Teacher: lessons
  async getLearningOverview() {
    return request<LearningTeacherOverview>('/api/learning/teacher/overview');
  },

  async getTeacherLessons(filters: LessonListFilters = {}) {
    const query = new URLSearchParams();
    if (filters.q?.trim()) query.set('q', filters.q.trim());
    if (filters.status && filters.status !== 'all') query.set('status', filters.status);
    if (filters.scope === 'mine') query.set('scope', 'mine');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<LearningLessonCard[]>(`/api/learning/teacher/lessons${suffix}`);
  },

  async bulkSetLessonStatus(lessonIds: string[], status: 'draft' | 'published') {
    return request<BulkLessonStatusResult>('/api/learning/teacher/lessons/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ lessonIds, status }),
    });
  },

  async bulkDeleteLessons(lessonIds: string[]) {
    return request<BulkLessonDeleteResult>('/api/learning/teacher/lessons/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ lessonIds }),
    });
  },

  async createLesson(data: { title: string; description?: string }) {
    return request<LearningLessonCard>('/api/learning/teacher/lessons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateLesson(lessonId: string, data: { title: string; description?: string }) {
    return request<LearningLessonCard>(`/api/learning/teacher/lessons/${lessonId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteLesson(lessonId: string) {
    return request<{ success: boolean; message: string }>(`/api/learning/teacher/lessons/${lessonId}`, {
      method: 'DELETE',
    });
  },

  async setLessonStatus(lessonId: string, action: 'publish' | 'unpublish') {
    return request<LearningLessonCard>(`/api/learning/teacher/lessons/${lessonId}/${action}`, {
      method: 'POST',
    });
  },

  // Teacher: materials
  async listMaterials(lessonId: string) {
    return request<LearningMaterial[]>(`/api/learning/teacher/lessons/${lessonId}/materials`);
  },

  /**
   * Uploads via XHR (not fetch) so the caller gets real upload progress
   * events; fetch cannot observe request-body progress.
   */
  uploadMaterial(lessonId: string, file: File, onProgress: (percent: number) => void): Promise<LearningMaterial> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/learning/teacher/lessons/${lessonId}/materials`);
      if (jwtToken) xhr.setRequestHeader('Authorization', `Bearer ${jwtToken}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data: { error?: string } | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error body */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as unknown as LearningMaterial);
        } else {
          if (xhr.status === 401 || xhr.status === 403) {
            window.dispatchEvent(new Event('unauthorized'));
          }
          reject(new Error(data?.error || `Upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },

  async deleteMaterial(materialId: string) {
    return request<{ success: boolean; message: string }>(`/api/learning/teacher/materials/${materialId}`, {
      method: 'DELETE',
    });
  },

  // Teacher: exercises / quizzes
  async listExercises(lessonId: string) {
    return request<LearningExercise[]>(`/api/learning/teacher/lessons/${lessonId}/exercises`);
  },

  /** Cross-lesson quiz library for the teacher's Quiz Management table. */
  async getTeacherQuizzes() {
    return request<LearningQuizCard[]>('/api/learning/teacher/quizzes');
  },

  async createExercise(lessonId: string, data: { title: string; instructions?: string; questions: unknown[] }) {
    return request<LearningExercise>(`/api/learning/teacher/lessons/${lessonId}/exercises`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateExercise(exerciseId: string, data: { title: string; instructions?: string; questions: unknown[] }) {
    return request<LearningExercise>(`/api/learning/teacher/exercises/${exerciseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteExercise(exerciseId: string) {
    return request<{ success: boolean; message: string }>(`/api/learning/teacher/exercises/${exerciseId}`, {
      method: 'DELETE',
    });
  },

  async generateExerciseAI(data: { topic: string; difficulty: string; questionCount: number }) {
    return request<LearningAIDraft>('/api/learning/teacher/exercises/generate-ai', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Teacher: submissions & review
  async getTeacherSubmissions(lessonId?: string) {
    const query = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : '';
    return request<LearningSubmissionSummary[]>(`/api/learning/teacher/submissions${query}`);
  },

  async getSubmissionDetail(submissionId: string) {
    return request<LearningSubmissionDetail>(`/api/learning/teacher/submissions/${submissionId}`);
  },

  async reviewSubmission(submissionId: string, data: { score: number; feedback: string }) {
    return request<LearningSubmissionDetail>(`/api/learning/teacher/submissions/${submissionId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Teacher: announcements
  async createAnnouncement(data: { title: string; body: string }) {
    return request<LearningAnnouncement>('/api/learning/teacher/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteAnnouncement(announcementId: string) {
    return request<{ success: boolean; message: string }>(
      `/api/learning/teacher/announcements/${announcementId}`,
      { method: 'DELETE' }
    );
  },

  // Shared (teacher + student): announcements
  async getAnnouncements() {
    return request<LearningAnnouncement[]>('/api/learning/announcements');
  },

  // Student
  async getStudentLessons() {
    return request<LearningStudentLessonCard[]>('/api/learning/student/lessons');
  },

  async getStudentLesson(lessonId: string) {
    return request<LearningStudentLesson>(`/api/learning/student/lessons/${lessonId}`);
  },

  async getStudentProgress() {
    return request<LearningStudentProgress>('/api/learning/student/progress');
  },

  async getMySubmissions() {
    return request<LearningSubmissionDetail[]>('/api/learning/student/submissions');
  },

  async submitAnswers(lessonId: string, exerciseId: string, answers: { questionId: string; answer: string }[]) {
    return request<LearningSubmissionDetail>(
      `/api/learning/student/lessons/${lessonId}/exercises/${exerciseId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      }
    );
  },

  // Public landing page ("Home") — reachable without a session. Both calls
  // opt out of the global session-expiry redirect: a visitor standing on the
  // public page must never be navigated away because the page's own data
  // request failed.

  /** Aggregate questionnaire totals; no per-respondent data is returned. */
  async getHomeData() {
    return request<HomePublicData>('/api/home', {}, { isPublic: true });
  },

  /**
   * Submits the interest questionnaire. Anonymous by design — the visitor
   * supplies their own name and student ID before signing in.
   */
  async submitHomeFeedback(submission: HomeFeedbackSubmission) {
    return request<{ choice: HomeFeedbackChoice; totals: HomeFeedbackTotals }>(
      '/api/home/feedback',
      {
        method: 'POST',
        body: JSON.stringify(submission),
      },
      { isPublic: true }
    );
  },

  // Landing page — admin analytics
  async getHomeFeedbackStats() {
    return request<HomeFeedbackStats>('/api/home/admin/feedback');
  },

  // School section — the Voice Recording Exercise.
  // Teacher (= admin role) surface:
  async getSchoolOverview() {
    return request<SchoolOverview>('/api/school/teacher/overview');
  },

  async getTeacherVoiceAssignments() {
    return request<TeacherVoiceAssignment[]>('/api/school/teacher/assignments');
  },

  async createVoiceAssignment(data: VoiceAssignmentInput) {
    return request<TeacherVoiceAssignment>('/api/school/teacher/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateVoiceAssignment(assignmentId: string, data: VoiceAssignmentInput) {
    return request<TeacherVoiceAssignment>(`/api/school/teacher/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async setVoiceAssignmentStatus(assignmentId: string, status: 'draft' | 'published') {
    return request<TeacherVoiceAssignment>(
      `/api/school/teacher/assignments/${assignmentId}/${status === 'published' ? 'publish' : 'unpublish'}`,
      { method: 'POST' }
    );
  },


  async getAssignmentAudioStats(assignmentId: string) {
    return request<{
      assignmentId: string; title: string; total: number; reviewed: number;
      unreviewed: number; hasAudio: number; alreadyPurged: number;
      totalSizeMB: number; canSafelyPurge: boolean;
    }>(`/api/school/teacher/assignments/${assignmentId}/audio-stats`);
  },

  async purgeAssignmentAudio(assignmentId: string, force = false) {
    return request<{ success: boolean; message: string; purged: number; skipped: number }>(
      `/api/school/teacher/assignments/${assignmentId}/purge-audio`,
      { method: 'POST', body: JSON.stringify({ force }) }
    );
  },
  async deleteVoiceAssignment(assignmentId: string) {
    return request<{ success: boolean; message: string; deletedSubmissions: number }>(
      `/api/school/teacher/assignments/${assignmentId}`,
      { method: 'DELETE' }
    );
  },

  async getTeacherVoiceSubmissions(assignmentId?: string) {
    const query = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : '';
    return request<TeacherVoiceSubmission[]>(`/api/school/teacher/submissions${query}`);
  },

  async getVoiceSubmissionDetail(submissionId: string) {
    return request<TeacherVoiceSubmissionDetail>(`/api/school/teacher/submissions/${submissionId}`);
  },

  async reviewVoiceSubmission(submissionId: string, data: { score: number; feedback: string }) {
    return request<TeacherVoiceSubmissionDetail>(
      `/api/school/teacher/submissions/${submissionId}/review`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  },

  // School section — student surface:
  async getStudentVoiceAssignments() {
    return request<StudentVoiceAssignmentSummary[]>('/api/school/student/assignments');
  },

  async getStudentVoiceAssignment(assignmentId: string) {
    return request<StudentVoiceAssignmentDetail>(`/api/school/student/assignments/${assignmentId}`);
  },

  /**
   * Uploads a browser recording. XHR (not fetch) purely for upload progress —
   * a student on a slow connection gets a real percentage instead of a spinner.
   */
  uploadVoiceRecording(
    assignmentId: string,
    recording: Blob,
    filename: string,
    durationSeconds: number,
    onProgress: (percent: number) => void
  ): Promise<VoiceSubmitResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/school/student/assignments/${assignmentId}/submissions`);
      if (jwtToken) xhr.setRequestHeader('Authorization', `Bearer ${jwtToken}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data: { error?: string } | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error body */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as unknown as VoiceSubmitResult);
        } else {
          if (xhr.status === 401 || xhr.status === 403) {
            window.dispatchEvent(new Event('unauthorized'));
          }
          reject(new Error(data?.error || `Upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading the recording. Please try again.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      const form = new FormData();
      form.append('audio', recording, filename);
      form.append('durationSeconds', String(Math.round(durationSeconds)));
      xhr.send(form);
    });
  },

  /**
   * Fetches a stored recording as a blob.
   *
   * A plain `<audio src>` cannot carry the Bearer token and an unauthenticated
   * URL would be a security hole, so the bytes are fetched with the session
   * header and played from an object URL — the same approach DocumentViewer
   * uses for PDFs. Authorization is enforced server-side per submission.
   */
  async getSubmissionAudio(submissionId: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/api/school/submissions/${submissionId}/audio`, {
      headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `Could not load the recording (${res.status}).`);
    }
    return res.blob();
  },
};