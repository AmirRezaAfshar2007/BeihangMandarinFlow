import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import { AppError, ForbiddenError } from '../utils/errors.ts';

/**
 * Learning Hub file storage.
 *
 * Files are stored in MongoDB GridFS rather than on the local filesystem
 * because the documented deployment target (Render free tier via nixpacks)
 * has an ephemeral disk: any file written next to the code would vanish on
 * the next redeploy. GridFS stores materials inside the same Atlas cluster
 * as every other record, so they survive redeploys with zero extra
 * infrastructure — the same reasoning that moved the app from db.json to
 * MongoDB (see DEPLOYMENT_GUIDE.md).
 *
 * GridFSBucket comes from `mongoose.mongo` (mongoose's bundled driver) so
 * runtime instances and TypeScript types match the connection object — the
 * project also declares a standalone `mongodb` dependency for utility
 * scripts, and mixing the two copies is a type/runtime hazard.
 */

const { GridFSBucket } = mongoose.mongo;

export const MATERIALS_BUCKET = 'learning_materials';

// 15 MB cap. Matches the JSON body limit used for base64 audio payloads so
// a single upload can never dominate the request pipeline.
export const MAX_MATERIAL_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * The one source of truth for allowed material types. Extension, MIME type,
 * and magic-byte signature are all derived from this table so they can never
 * drift apart. Both the multer fileFilter (route level) and the post-upload
 * validator (buffer level) use it.
 */
export const ALLOWED_MATERIAL_TYPES: Record<
  string,
  { mime: string; magic?: Buffer[]; label: string }
> = {
  pdf: { mime: 'application/pdf', magic: [Buffer.from('%PDF')], label: 'PDF Document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint 97-2003' },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // OOXML files are ZIP containers; every valid .pptx starts with "PK\x03\x04".
    magic: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    label: 'PowerPoint Presentation',
  },
  doc: { mime: 'application/msword', label: 'Word 97-2003' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    label: 'Word Document',
  },
};

const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_MATERIAL_TYPES);

/** mongoose Types.ObjectId -> the driver's ObjectId for GridFS calls. */
function toDriverId(id: Types.ObjectId): mongoose.mongo.ObjectId {
  return id as unknown as mongoose.mongo.ObjectId;
}

function getBucket(bucketName: string = MATERIALS_BUCKET): mongoose.mongo.GridFSBucket {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new AppError('Database is not connected. Please try again shortly.', 503);
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName });
}

/**
 * Strips directory components (path traversal defense) and anything outside
 * a conservative safe-character set, then enforces a sane length. The result
 * is display metadata only — storage ids are ObjectIds, so a hostile
 * filename can never influence where a file lands.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]+/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[^a-zA-Z0-9._ \-\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'upload';
  }
  return cleaned.slice(0, 120);
}

export function getExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

export function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.includes(getExtension(filename));
}

/**
 * Multer fileFilter — runs during multipart parsing. Rejects wrong
 * extensions/declared MIME types before the file is written anywhere.
 */
export function materialFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype: string },
  cb: (error: Error | null, accept?: boolean) => void
) {
  const ext = getExtension(file.originalname);
  const spec = ALLOWED_MATERIAL_TYPES[ext];
  if (!spec) {
    cb(
      new AppError(
        `File type ".${ext || 'unknown'}" is not supported. Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`,
        400
      )
    );
    return;
  }
  if (file.mimetype !== spec.mime) {
    cb(new AppError(`File content does not match its extension (expected ${spec.label}).`, 400));
    return;
  }
  cb(null, true);
}

/**
 * Magic-byte verification. Runs after multer has buffered the whole file,
 * so a polyglot that claims to be a PDF but doesn't start with %PDF is
 * rejected here even though it passed the header-level checks above.
 * Enforced for the formats where signatures are reliable (PDF and OOXML/ZIP
 * containers). Non-OOXML legacy binary formats (doc/ppt) are accepted
 * without a signature check because their CFB headers vary by producer.
 */
function assertMagicBytes(buffer: Buffer, extension: string): void {
  const spec = ALLOWED_MATERIAL_TYPES[extension];
  if (!spec?.magic) return;
  const ok = spec.magic.some((sig) => buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig));
  if (!ok) {
    throw new AppError(`File content is not a valid ${spec.label}.`, 400);
  }
}

export interface StoredMaterial {
  gridFsFileId: Types.ObjectId;
  originalName: string;
  kind: string;
  mimeType: string;
  size: number;
}

/**
 * Validates and stores one uploaded material buffer. Never trusts the
 * client-declared size or type — everything here is measured/derived
 * server-side from the received bytes.
 */
export async function storeMaterial(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): Promise<StoredMaterial> {
  const extension = getExtension(file.originalname);
  const spec = ALLOWED_MATERIAL_TYPES[extension];
  if (!spec) {
    throw new AppError('Unsupported file type.', 400);
  }
  if (file.size <= 0) {
    throw new AppError('The uploaded file is empty.', 400);
  }
  if (file.size > MAX_MATERIAL_SIZE_BYTES) {
    throw new AppError('File exceeds the 15 MB size limit.', 413);
  }
  assertMagicBytes(file.buffer, extension);

  const safeName = sanitizeFilename(file.originalname);
  const bucket = getBucket();
  const uploadStream = bucket.openUploadStream(safeName, {
    // contentType is kept in metadata (portable across driver versions).
    metadata: { storedBy: 'learning-hub', originalExtension: extension, contentType: spec.mime },
  });

  await new Promise<void>((resolve, reject) => {
    Readable.from(file.buffer).pipe(uploadStream as unknown as import('node:stream').Writable);
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve());
  });

  return {
    gridFsFileId: uploadStream.id as unknown as Types.ObjectId,
    originalName: safeName,
    kind: extension,
    mimeType: spec.mime,
    size: file.size,
  };
}

/**
 * Streams a stored file back. Authorization happens in the route/service
 * layer BEFORE this is called — the caller passes the material document and
 * this function only does the mechanical read.
 */
export async function readMaterialStream(gridFsFileId: Types.ObjectId, bucketName: string = MATERIALS_BUCKET): Promise<{
  stream: Readable;
  length: number;
  contentType: string;
  filename: string;
}> {
  const bucket = getBucket(bucketName);
  const files = await bucket.find({ _id: toDriverId(gridFsFileId) }).limit(1).toArray();
  const file = files[0];
  if (!file) {
    throw new AppError('The stored file could not be found.', 404);
  }
  const metadataContentType =
    file.metadata && typeof (file.metadata as Record<string, unknown>).contentType === 'string'
      ? ((file.metadata as Record<string, unknown>).contentType as string)
      : '';
  return {
    stream: bucket.openDownloadStream(toDriverId(gridFsFileId)) as unknown as Readable,
    length: file.length,
    contentType: metadataContentType || 'application/octet-stream',
    filename: file.filename,
  };
}

export async function deleteMaterialFile(gridFsFileId: Types.ObjectId): Promise<void> {
  const bucket = getBucket();
  // Newer driver typings make the callback form look like an options object;
  // promisify keeps runtime behavior identical across driver versions.
  const deleteFile = bucket.delete.bind(bucket) as (
    id: mongoose.mongo.ObjectId
  ) => Promise<void>;
  await deleteFile(toDriverId(gridFsFileId));
}

/**
 * ForbiddenError helper kept here so routes don't import the class just for
 * material ownership re-checks.
 */
export function assertMaterialOwner(materialTeacherId: string, requestTeacherId: string): void {
  if (materialTeacherId !== requestTeacherId) {
    throw new ForbiddenError('You do not have permission to manage this material.');
  }
}

/* ------------------------------------------------------------------ */
/* School — student voice recordings                                   */
/* ------------------------------------------------------------------ */

/**
 * Student voice recordings live in their own GridFS bucket, next to (not
 * inside) the courseware bucket: they are student work rather than teacher
 * material, they are deleted independently, and keeping them apart means a
 * material cleanup can never touch a student recording.
 */
export const AUDIO_BUCKET = 'assignment_audio';

// 20 MB. Browser MediaRecorder output is compressed (opus/aac) and a
// multi-minute reading is typically well under 1 MB, so this only ever
// rejects something pathological — an uncompressed WAV capture, say.
export const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/** Upper bound accepted for the client-reported recording length. */
export const MAX_AUDIO_DURATION_SECONDS = 300;

/**
 * Allowed recording containers, keyed by *normalized* MIME type (parameters
 * such as `;codecs=opus` stripped).
 *
 * The extension is derived from this table instead of being trusted from the
 * client filename, because the browser picks the container, not us:
 * MediaRecorder emits audio/webm in Chromium, audio/ogg in Firefox and
 * audio/mp4 (AAC) in Safari — all three have to be accepted, and none of
 * them reliably arrives with the "right" filename.
 */
export const ALLOWED_AUDIO_TYPES: Record<string, { ext: string; label: string }> = {
  'audio/webm': { ext: 'webm', label: 'WebM/Opus recording' },
  'audio/ogg': { ext: 'ogg', label: 'Ogg/Opus recording' },
  'audio/mp4': { ext: 'm4a', label: 'MP4/AAC recording' },
  'audio/m4a': { ext: 'm4a', label: 'M4A recording' },
  'audio/x-m4a': { ext: 'm4a', label: 'M4A recording' },
  'audio/mpeg': { ext: 'mp3', label: 'MP3 recording' },
  'audio/wav': { ext: 'wav', label: 'WAV recording' },
  'audio/x-wav': { ext: 'wav', label: 'WAV recording' },
  'audio/wave': { ext: 'wav', label: 'WAV recording' },
};

/** `audio/webm;codecs=opus` -> `audio/webm`. */
export function normalizeAudioMime(raw: string): string {
  return (raw || '').split(';')[0].trim().toLowerCase();
}

function audioSpec(mime: string) {
  return ALLOWED_AUDIO_TYPES[normalizeAudioMime(mime)];
}

/**
 * Multer fileFilter for voice uploads. Runs while the multipart body is still
 * being parsed, so a disallowed container is rejected before it is buffered.
 */
export function audioFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype: string },
  cb: (error: Error | null, accept?: boolean) => void
) {
  if (!audioSpec(file.mimetype)) {
    cb(
      new AppError(
        `Recording format "${normalizeAudioMime(file.mimetype) || 'unknown'}" is not supported. Allowed: ${Object.keys(
          ALLOWED_AUDIO_TYPES
        ).join(', ')}.`,
        400
      )
    );
    return;
  }
  cb(null, true);
}

/**
 * Verifies the received bytes really are the container the client claimed.
 *
 * `\"ftyp\"` sits at byte 4 of every ISO-BMFF (MP4/M4A) file, after the box
 * length, so it is checked at that offset rather than at 0.
 */
function assertAudioMagicBytes(buffer: Buffer, ext: string): void {
  const at = (offset: number, ascii: string) =>
    buffer.length >= offset + ascii.length &&
    buffer.subarray(offset, offset + ascii.length).toString('latin1') === ascii;

  switch (ext) {
    case 'webm':
      // EBML header used by Matroska/WebM.
      if (!(buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)) {
        throw new AppError('The uploaded audio is not a valid WebM recording.', 400);
      }
      return;
    case 'ogg':
      if (!at(0, 'OggS')) {
        throw new AppError('The uploaded audio is not a valid Ogg recording.', 400);
      }
      return;
    case 'm4a':
      if (!at(4, 'ftyp')) {
        throw new AppError('The uploaded audio is not a valid MP4/M4A recording.', 400);
      }
      return;
    case 'wav':
      if (!at(0, 'RIFF') || !at(8, 'WAVE')) {
        throw new AppError('The uploaded audio is not a valid WAV recording.', 400);
      }
      return;
    case 'mp3':
      // Either an ID3v2 tag or a raw frame sync (0xFFEx/0xFFFx).
      if (!at(0, 'ID3') && !(buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
        throw new AppError('The uploaded audio is not a valid MP3 recording.', 400);
      }
      return;
    default:
      throw new AppError('Unsupported recording format.', 400);
  }
}

export interface StoredAudio {
  gridFsFileId: Types.ObjectId;
  bucketName: string;
  mimeType: string;
  size: number;
  originalName: string;
}

/**
 * Validates and stores one recording. Size and format are measured from the
 * received bytes; the client-declared filename and MIME type are only used as
 * a hint, never as the authority.
 */
export async function storeAudio(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): Promise<StoredAudio> {
  const spec = audioSpec(file.mimetype);
  if (!spec) {
    throw new AppError('Unsupported recording format.', 400);
  }
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new AppError('The recording is empty. Please record again.', 400);
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    throw new AppError(`The recording exceeds the ${Math.round(MAX_AUDIO_SIZE_BYTES / (1024 * 1024))} MB limit.`, 413);
  }
  assertAudioMagicBytes(file.buffer, spec.ext);

  const canonicalMime = normalizeAudioMime(file.mimetype);
  const safeName = `recording-${Date.now()}.${spec.ext}`;
  const bucket = getBucket(AUDIO_BUCKET);
  const uploadStream = bucket.openUploadStream(safeName, {
    metadata: { storedBy: 'school', contentType: canonicalMime },
  });

  await new Promise<void>((resolve, reject) => {
    Readable.from(file.buffer).pipe(uploadStream as unknown as import('node:stream').Writable);
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve());
  });

  return {
    gridFsFileId: uploadStream.id as unknown as Types.ObjectId,
    bucketName: AUDIO_BUCKET,
    mimeType: canonicalMime,
    size: file.size,
    originalName: safeName,
  };
}

/**
 * Streams a stored recording back. Authorization happens in the service layer
 * BEFORE this is called — the caller passes a submission it has already proved
 * the requester may read.
 */
export async function readAudioStream(
  gridFsFileId: Types.ObjectId,
  bucketName: string = AUDIO_BUCKET
): Promise<{ stream: Readable; length: number; contentType: string }> {
  const bucket = getBucket(bucketName);
  const files = await bucket.find({ _id: toDriverId(gridFsFileId) }).limit(1).toArray();
  const file = files[0];
  if (!file) {
    throw new AppError('The recorded audio could not be found.', 404);
  }
  const meta = (file.metadata ?? {}) as Record<string, unknown>;
  return {
    stream: bucket.openDownloadStream(toDriverId(gridFsFileId)) as unknown as Readable,
    length: file.length,
    contentType: typeof meta.contentType === 'string' && meta.contentType ? meta.contentType : 'audio/webm',
  };
}

/** Removes a stored recording. Missing objects are not an error. */
export async function deleteAudioFile(
  gridFsFileId: Types.ObjectId,
  bucketName: string = AUDIO_BUCKET
): Promise<void> {
  const bucket = getBucket(bucketName);
  const deleteFile = bucket.delete.bind(bucket) as (id: mongoose.mongo.ObjectId) => Promise<void>;
  try {
    await deleteFile(toDriverId(gridFsFileId));
  } catch (err) {
    // GridFS throws "FileNotFound" for an already-removed object; that is the
    // desired end state, so it must not fail the surrounding operation.
    console.warn(`[storage] Could not delete audio file ${gridFsFileId}:`, err);
  }
}
