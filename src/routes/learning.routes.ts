import { Router, Response, Request } from 'express';
import multer from 'multer';
import { Readable } from 'node:stream';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { materialUploadLimiter, aiExerciseLimiter } from '../middleware/rateLimit.learning.ts';
import { AppError, ForbiddenError } from '../utils/errors.ts';
import * as learningService from '../services/learning.service.ts';
import {
  materialFileFilter,
  storeMaterial,
  readMaterialStream,
  MAX_MATERIAL_SIZE_BYTES,
} from '../services/storage.service.ts';
import { generateExerciseWithAI } from '../services/aiExercise.service.ts';

const router = Router();
router.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Authorization guards                                                */
/* ------------------------------------------------------------------ */

/**
 * Teacher = admin in the existing role model. Guard is a function (not
 * middleware) so it composes cleanly inside route handlers after requireAuth.
 */
function assertTeacher(req: AuthRequest): asserts req is AuthRequest & { user: NonNullable<AuthRequest['user']> } {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenError('Teacher access required.');
  }
}

function requireTeacherId(req: AuthRequest): string {
  assertTeacher(req);
  return req.user.studentId;
}

/**
 * Validated query filters for the lesson management list. Anything
 * unrecognized falls back to the widest safe value, so a hand-crafted query
 * string can never widen access or break the query shape.
 */
function parseLessonFilters(req: AuthRequest): learningService.LessonListFilters {
  const { q, status, scope } = req.query;
  return {
    q: typeof q === 'string' ? q.slice(0, 80) : undefined,
    status: status === 'draft' || status === 'published' ? status : 'all',
    scope: scope === 'mine' ? 'mine' : 'all',
  };
}

/* ------------------------------------------------------------------ */
/* Multer upload pipeline                                              */
/* ------------------------------------------------------------------ */

// Minimal structural type for multer's memory-storage file. Avoids pulling
// in @types/multer (network-restricted environment) while staying typed.
interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Memory storage: the buffer is needed for magic-byte verification before
// anything is persisted. 15 MB matches MAX_MATERIAL_SIZE_BYTES enforced
// again (defensively) inside storeMaterial.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MATERIAL_SIZE_BYTES, files: 1 },
  // materialFileFilter matches multer's own signature; the cast keeps the
  // strict typechecker happy without loosening it anywhere else.
  fileFilter: materialFileFilter as unknown as multer.Options['fileFilter'],
});

/* ------------------------------------------------------------------ */
/* Teacher — lessons                                                   */
/* ------------------------------------------------------------------ */

router.get(
  '/teacher/overview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.json(await learningService.getTeacherOverview(teacherId));
  })
);

router.get(
  '/teacher/lessons',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.json(await learningService.listTeacherLessons(teacherId, parseLessonFilters(req)));
  })
);

router.post(
  '/teacher/lessons',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.status(201).json(await learningService.createLesson(teacherId, req.body));
  })
);

/**
 * Bulk lesson management. Registered before the parameterized lesson routes
 * so "bulk-status" is never parsed as a lesson id. Both handlers enforce
 * `role === 'admin'` and validate ids inside the service — a bulk call is a
 * convenience over the single-lesson endpoints, not a way around them.
 */
router.post(
  '/teacher/lessons/bulk-status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const { lessonIds, status } = req.body ?? {};
    res.json(await learningService.bulkSetLessonStatus(lessonIds, status));
  })
);

router.post(
  '/teacher/lessons/bulk-delete',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const { lessonIds } = req.body ?? {};
    res.json(await learningService.bulkDeleteLessons(lessonIds));
  })
);

router.patch(
  '/teacher/lessons/:lessonId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.updateLesson(req.params.lessonId, req.body));
  })
);

router.post(
  '/teacher/lessons/:lessonId/publish',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.setLessonStatus(req.params.lessonId, 'published'));
  })
);

router.post(
  '/teacher/lessons/:lessonId/unpublish',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.setLessonStatus(req.params.lessonId, 'draft'));
  })
);

router.delete(
  '/teacher/lessons/:lessonId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.deleteLesson(req.params.lessonId));
  })
);

/* ------------------------------------------------------------------ */
/* Teacher — materials                                                 */
/* ------------------------------------------------------------------ */

router.post(
  '/teacher/lessons/:lessonId/materials',
  materialUploadLimiter,
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    // multer attaches .file (memory storage) after parsing the multipart body.
    const file = (req as AuthRequest & { file?: UploadedFile }).file;
    if (!file) {
      throw new AppError('No file was uploaded. Attach a file under the "file" field.', 400);
    }
    const material = await learningService.addMaterial(teacherId, req.params.lessonId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    res.status(201).json(material);
  })
);

router.get(
  '/teacher/lessons/:lessonId/materials',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.listMaterials(req.params.lessonId));
  })
);

router.delete(
  '/teacher/materials/:materialId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.deleteMaterial(req.params.materialId));
  })
);

/**
 * Secure download/preview endpoint. Works for both roles: the owning teacher
 * and any student while the lesson is published (see getMaterialForAccess).
 * The GridFS filename is regenerated per response so private storage names
 * are never exposed; Content-Disposition carries the sanitized display name.
 */
export async function streamMaterial(req: Request & { user?: AuthRequest['user'] }, res: Response, disposition: 'inline' | 'attachment') {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  const material = await learningService.getMaterialForAccess(req.user, req.params.materialId);
  const { stream, length, contentType } = await readMaterialStream(material.gridFsFileId);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(length));
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(material.originalName)}"`
  );
  res.setHeader('Cache-Control', 'private, max-age=300');

  // GridFSBucketReadStream is already a Node Readable — pipe it straight to
  // the response (it self-closes, ending the response, when the file ends).
  stream.pipe(res);
}

router.get(
  '/materials/:materialId/download',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await streamMaterial(req as AuthRequest, res, 'attachment');
  })
);

router.get(
  '/materials/:materialId/preview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await streamMaterial(req as AuthRequest, res, 'inline');
  })
);

/* ------------------------------------------------------------------ */
/* Teacher — exercises                                                 */
/* ------------------------------------------------------------------ */

router.get(
  '/teacher/quizzes',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.listQuizzesForTeacher());
  })
);

router.get(
  '/teacher/lessons/:lessonId/exercises',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.listExercisesForTeacher(req.params.lessonId));
  })
);

router.post(
  '/teacher/lessons/:lessonId/exercises',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.status(201).json(await learningService.createExercise(teacherId, req.params.lessonId, req.body));
  })
);

router.patch(
  '/teacher/exercises/:exerciseId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.updateExercise(req.params.exerciseId, req.body));
  })
);

router.delete(
  '/teacher/exercises/:exerciseId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.deleteExercise(req.params.exerciseId));
  })
);

/**
 * AI exercise generation. Returns DRAFT questions only — the client must
 * show them to the teacher for review/editing before anything is saved or
 * published. This endpoint never writes to the database.
 */
router.post(
  '/teacher/exercises/generate-ai',
  aiExerciseLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireTeacherId(req);
    const draft = await generateExerciseWithAI(req.body);
    res.json(draft);
  })
);

/* ------------------------------------------------------------------ */
/* Teacher — submissions                                               */
/* ------------------------------------------------------------------ */

router.get(
  '/teacher/submissions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const lessonId = typeof req.query.lessonId === 'string' ? req.query.lessonId : undefined;
    res.json(await learningService.listSubmissionsForTeacher(lessonId));
  })
);

router.get(
  '/teacher/submissions/:submissionId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    res.json(await learningService.getSubmissionForTeacher(req.params.submissionId));
  })
);

router.post(
  '/teacher/submissions/:submissionId/review',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertTeacher(req);
    const { score, feedback } = req.body ?? {};
    res.json(await learningService.reviewSubmission(req.params.submissionId, { score, feedback }));
  })
);

/* ------------------------------------------------------------------ */
/* Teacher — announcements                                             */
/* ------------------------------------------------------------------ */

router.get(
  '/announcements',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await learningService.listAnnouncements());
  })
);

router.post(
  '/teacher/announcements',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.status(201).json(await learningService.createAnnouncement(teacherId, req.body));
  })
);

router.delete(
  '/teacher/announcements/:announcementId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teacherId = requireTeacherId(req);
    res.json(await learningService.deleteAnnouncement(teacherId, req.params.announcementId));
  })
);

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

router.get(
  '/student/lessons',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'student') {
      // Admins see the teacher surface instead; students never hit it.
      throw new ForbiddenError('Student access required.');
    }
    res.json(await learningService.listPublishedLessons(req.user!.studentId));
  })
);

router.get(
  '/student/lessons/:lessonId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'student') {
      throw new ForbiddenError('Student access required.');
    }
    res.json(await learningService.getStudentLesson(req.user!.studentId, req.params.lessonId));
  })
);

router.get(
  '/student/progress',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'student') {
      throw new ForbiddenError('Student access required.');
    }
    res.json(await learningService.getStudentProgress(req.user!.studentId));
  })
);

router.get(
  '/student/submissions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'student') {
      throw new ForbiddenError('Student access required.');
    }
    res.json(await learningService.listMySubmissions(req.user!.studentId));
  })
);

router.post(
  '/student/lessons/:lessonId/exercises/:exerciseId/submit',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'student') {
      throw new ForbiddenError('Student access required.');
    }
    const { answers } = req.body ?? {};
    const submission = await learningService.submitAnswers(
      req.user!.studentId, // ownership derived from the JWT, never the body
      req.params.lessonId,
      req.params.exerciseId,
      answers
    );
    res.status(201).json(submission);
  })
);

export default router;
