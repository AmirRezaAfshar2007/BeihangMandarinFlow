import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // Fail fast at boot rather than limping along with an undefined secret.
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

/**
 * Reads a positive integer tuning knob, falling back to the given default
 * when unset/blank/non-numeric. These control how much concurrent heavy work
 * the process will accept, so a typo must never be able to disable the cap
 * (e.g. by parsing to NaN and turning a limit into "unlimited").
 */
function intSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[env] Ignoring invalid ${name}=${raw} (expected a positive integer); using ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function boolSetting(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mongoUri: required('MONGODB_URI'),
  // Alibaba Cloud Bailian / DashScope (Qwen models). Mainland-China-reachable,
  // no VPN required — this replaced the Google Gemini integration, which was
  // blocked in mainland China without one. Get a key at bailian.console.aliyun.com.
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY || '',
  // Cloudinary — برای آینده (فعلاً GridFS استفاده میشه)
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || '',
  isProduction: process.env.NODE_ENV === 'production',
  // Optional outbound HTTPS proxy. Some corporate/school networks and VPNs
  // require all outbound traffic to go through a proxy — browsers usually
  // pick this up automatically from OS settings, but Node's fetch does not.
  // Set HTTPS_PROXY (or HTTP_PROXY) in .env if AI calls are timing out.
  httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '',

  // --- Heavy-work concurrency limits -------------------------------------
  //
  // The two expensive things this server does are transcoding audio with
  // ffmpeg and calling the AI model. Neither is safe to run unbounded: a
  // 512 MB instance (Render's default) OOMs after a handful of simultaneous
  // ffmpeg processes, and a classroom all recording at once would otherwise
  // spawn one process per request. These caps keep the process inside its
  // memory budget and turn overload into a fast, honest 503 instead of a
  // crash. Sized for a single-instance pilot with ~150 students.
  ffmpegConcurrency: intSetting('FFMPEG_CONCURRENCY', 2),
  aiConcurrency: intSetting('AI_CONCURRENCY', 3),
  // Hard kill for a wedged ffmpeg process, so a corrupt/odd input can never
  // hold a request (and its memory) open forever.
  ffmpegTimeoutMs: intSetting('FFMPEG_TIMEOUT_MS', 30_000),
  // How long a request waits for a free slot in one of the pools above
  // before being answered with 503 rather than queueing indefinitely.
  requestQueueTimeoutMs: intSetting('REQUEST_QUEUE_TIMEOUT_MS', 20_000),

  // Mirrors the frontend flag in src/lib/features.ts. The Login page hides the
  // sign-up form when that constant is false, but the endpoint itself must be
  // closed too — otherwise anyone can still POST /api/auth/register directly
  // and create student accounts. Admin-created accounts use the admin-only
  // route instead, so nothing legitimate depends on this staying open.
  allowSelfRegistration: boolSetting('ALLOW_SELF_REGISTRATION', false),
};
