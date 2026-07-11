import { Request } from 'express';

/** JWT payload embedded in every signed access token. */
export interface AuthTokenPayload {
  id: string;
  studentId: string;
  fullName: string;
  role: 'admin' | 'student';
  jti: string; // unique token id, used to look up / revoke the server-side session
}

/** Express Request extended with the authenticated user (set by requireAuth). */
export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}
