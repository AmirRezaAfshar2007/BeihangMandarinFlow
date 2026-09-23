import React, { useState } from 'react';
import StudentSchool from './StudentSchool';
import AssignmentWorkspace from './AssignmentWorkspace';
import TeacherSchool from './TeacherSchool';
import type { HubUser } from '../learning/learningTypes';

interface SchoolHubProps {
  user: HubUser;
  onBack: () => void;
}

/**
 * School section entry point — the student's main place to see and complete
 * assignments, and the teacher's place to create them and review recordings.
 *
 * The role comes from the authenticated user object produced by the existing
 * JWT flow (`admin` is the teaching role, as everywhere else in this app), so
 * there is no client-side role switching: a student can only ever reach the
 * student surface, and every corresponding endpoint enforces the same rule
 * server-side.
 */
export default function SchoolHub({ user, onBack }: SchoolHubProps) {
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);

  if (user.role === 'admin') {
    return <TeacherSchool onBack={onBack} />;
  }

  if (openAssignmentId) {
    return (
      <AssignmentWorkspace assignmentId={openAssignmentId} onBack={() => setOpenAssignmentId(null)} />
    );
  }

  return <StudentSchool onOpenAssignment={setOpenAssignmentId} onBack={onBack} />;
}
