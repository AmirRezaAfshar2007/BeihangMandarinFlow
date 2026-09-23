import React from 'react';
import TeacherHub from './TeacherHub';
import StudentHub from './StudentHub';
import type { HubUser } from './learningTypes';

interface LearningHubProps {
  user: HubUser;
  onBack: () => void;
  /** Student-only: open a published lesson. */
  onOpenLesson: (lessonId: string) => void;
}

/**
 * Learning Hub entry point. Role is taken from the authenticated user object
 * produced by the existing JWT flow — admins get the teacher surface,
 * students the learner surface. There is no client-side role switching.
 */
export default function LearningHub({ user, onBack, onOpenLesson }: LearningHubProps) {
  if (user.role === 'admin') {
    return <TeacherHub user={user} onBack={onBack} />;
  }
  return <StudentHub onOpenLesson={onOpenLesson} onBack={onBack} />;
}
