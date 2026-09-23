import { Router, Response, Request } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { voiceSubmissionLimiter } from '../middleware/rateLimit.learning.ts';
import { AppError, ForbiddenError } from '../utils/errors.ts';
import * as schoolService from '../services/school.service.ts';
import {
  audioFileFilter,
  readAudioStream,
  MAX_AUDIO_SIZE_BYTES,
} from '../services/storage.service.ts';

/**
 * School section — the Voice Recording Exercise.
 *
 * Mounted at /api/school, behind requireAuth for every route in the file
 * (both roles are authenticated; nothing here is public). Student identity is
 * always read from the verified JWT (`req.user`), never from the body, so a
 * student cannot submit or read work as someone else.
 */
const router = Router();
router.use(requireAuth);


/* ------------------------------------------------------------------ */
/* Teacher — audio purge (آزاد کردن حافظه بعد از نمره‌دهی)           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/school/teacher/assignments/:assignmentId/audio-stats
 * وضعیت فایل‌های صوتی یه assignment رو نشون میده
 */
router.get(
  '/teacher/assignments/:assignmentId/audio-stats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.getAssignmentAudioStats(req.params.assignmentId));
  })
);

/**
 * POST /api/school/teacher/assignments/:assignmentId/purge-audio
 * فایل‌های صوتی رو حذف می‌کنه، نمره‌ها می‌مونن
 * body: { force?: boolean } — اگه true باشه حتی unreviewed هم حذف میشه
 */
router.post(
  '/teacher/assignments/:assignmentId/purge-audio',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const force = req.body?.force === true;
    res.json(await schoolService.purgeAssignmentAudio(req.params.assignmentId, force));
  })
);

/* ------------------------------------------------------------------ */
/* Authorization guards                                                */
/* ------------------------------------------------------------------ */

/** Teacher = admin in the existing role model (see learning.routes.ts). */
function assertTeacher(req: AuthRequest): asserts req is AuthRequest & { user: NonNullable<AuthRequest['user']> } {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenError('Teacher access required.');
  }
}

function assertStudent(req: AuthRequest): asserts req is AuthRequest & { user: NonNullable<AuthRequest['user']> } {
  if (req.user?.role !== 'student') {
    throw new ForbiddenError('Student access required.');
  }
}

/* ------------------------------------------------------------------ */
/* Recording upload                                                    */
/* ------------------------------------------------------------------ */

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Memory storage: the buffer has to be read for magic-byte verification
// before anything is persisted. The size cap is enforced again (defensively)
// inside storeAudio.
const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES, files: 1 },
  fileFilter: audioFileFilter as unknown as multer.Options['fileFilter'],
});

/**
 * Runs the multer middleware and surfaces its failures as AppErrors.
 *
 * Multer reports its own errors (including "file too large") through the
 * callback; letting one escape untouched would reach the global error handler
 * as an unknown error and answer 500 for what is plainly a 413/400.
 */
function runVoiceUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    voiceUpload.single('audio')(req, res, (err: unknown) => {
      if (!err) {
        resolve();
        return;
      }
      if (err instanceof multer.MulterError) {
        const detail = err as { code?: string; message?: string };
        if (detail.code === 'LIMIT_FILE_SIZE') {
          reject(
            new AppError(
              `The recording exceeds the ${Math.round(MAX_AUDIO_SIZE_BYTES / (1024 * 1024))} MB limit.`,
              413
            )
          );
          return;
        }
        reject(new AppError(`Upload rejected: ${detail.message ?? 'invalid upload'}.`, 400));
        return;
      }
      reject(err);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Teacher — assignments                                               */
/* ------------------------------------------------------------------ */

router.get(
  '/teacher/overview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = req.user!.studentId;
    assertTeacher(req);
    res.json(await schoolService.getSchoolOverview(teacherId));
  })
);

router.get(
  '/teacher/assignments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = req.user!.studentId;
    assertTeacher(req);
    res.json(await schoolService.listTeacherAssignments(teacherId));
  })
);

router.post(
  '/teacher/assignments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = req.user!.studentId;
    assertTeacher(req);
    res.status(201).json(await schoolService.createVoiceAssignment(teacherId, req.body));
  })
);

router.get(
  '/teacher/assignments/:assignmentId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.getAssignmentForTeacher(req.params.assignmentId));
  })
);

router.patch(
  '/teacher/assignments/:assignmentId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.updateVoiceAssignment(req.params.assignmentId, req.body));
  })
);

router.post(
  '/teacher/assignments/:assignmentId/publish',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.setVoiceAssignmentStatus(req.params.assignmentId, 'published'));
  })
);

router.post(
  '/teacher/assignments/:assignmentId/unpublish',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.setVoiceAssignmentStatus(req.params.assignmentId, 'draft'));
  })
);

router.delete(
  '/teacher/assignments/:assignmentId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.deleteVoiceAssignment(req.params.assignmentId));
  })
);

/* ------------------------------------------------------------------ */
/* Teacher — submission review                                         */
/* ------------------------------------------------------------------ */

router.get(
  '/teacher/submissions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const assignmentId = typeof req.query.assignmentId === 'string' ? req.query.assignmentId : undefined;
    res.json(await schoolService.listTeacherVoiceSubmissions(assignmentId));
  })
);

router.get(
  '/teacher/submissions/:submissionId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await schoolService.getVoiceSubmissionForTeacher(req.params.submissionId));
  })
);

router.post(
  '/teacher/submissions/:submissionId/review',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const { score, feedback } = req.body ?? {};
    res.json(await schoolService.reviewVoiceSubmission(req.params.submissionId, { score, feedback }));
  })
);

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

router.get(
  '/student/assignments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertStudent(req);
    res.json(await schoolService.listStudentAssignments(req.user.studentId));
  })
);

router.get(
  '/student/assignments/:assignmentId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertStudent(req);
    res.json(await schoolService.getStudentAssignment(req.user.studentId, req.params.assignmentId));
  })
);

router.get(
  '/student/submissions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertStudent(req);
    res.json(await schoolService.listMyVoiceSubmissions(req.user.studentId));
  })
);

router.post(
  '/student/assignments/:assignmentId/submissions',
  voiceSubmissionLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertStudent(req);
    await runVoiceUpload(req, res);
    const file = (req as AuthRequest & { file?: UploadedFile }).file;
    if (!file) {
      throw new AppError('No recording was uploaded. Attach the audio under the "audio" field.', 400);
    }
    const submission = await schoolService.submitVoiceRecording(
      req.user.studentId, // ownership from the JWT, never the request body
      req.user.fullName,
      req.params.assignmentId,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      (req.body ?? {}).durationSeconds
    );
    res.status(201).json(submission);
  })
);

/* ------------------------------------------------------------------ */
/* Audio streaming (authorized per submission)                         */
/* ------------------------------------------------------------------ */

/**
 * Serves one stored recording. The service decides who may listen — an admin
 * for any submission, a student only for their own — and answers 404 for
 * anything else, so the endpoint can't be used to discover other students'
 * work. Fetched by the app with the Bearer token into a blob; no raw
 * unauthenticated URL is ever handed to the browser.
 */
router.get(
  '/submissions/:submissionId/audio',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const submission = await schoolService.getSubmissionAudioForAccess(
      { studentId: req.user!.studentId, role: req.user!.role },
      req.params.submissionId
    );
    const { stream, length, contentType } = await readAudioStream(
      submission.audio.gridFsFileId,
      submission.audio.gridFsBucketName
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(length));
    // Student work is never cached by a shared proxy.
    res.setHeader('Cache-Control', 'private, no-store');

    stream.on('error', (err) => {
      console.error('[school] audio stream failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not read the stored recording.' });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  })
);

export default router;
