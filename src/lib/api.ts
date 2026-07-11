import { 
  Student, 
  CharacterItem, 
  PracticeLog, 
  StudentStats, 
  Achievement 
} from '../types.ts';

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
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
    if (response.status === 401 || response.status === 403) {
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

  async addCharacter(character: string) {
    return request<CharacterItem>('/api/characters/add', {
      method: 'POST',
      body: JSON.stringify({ character }),
    });
  },

  async deleteCharacter(charId: string) {
    return request<{ success: boolean; message: string }>(`/api/characters/${charId}`, {
      method: 'DELETE',
    });
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
};
