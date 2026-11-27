/**
 * Runtime configuration for Modulate.
 *
 * Self-hosters should only need to provide the database password (and
 * optionally the host port). Everything else has a safe default: the image is
 * always production, the session secret is generated once into the data
 * volume, and the web app is served from the same origin.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');

require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'production';
const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), 'data'),
);
const mediaRoot = path.resolve(
  process.env.MEDIA_ROOT || path.join(dataDir, 'media'),
);

function persistSecret(filename) {
  const target = path.join(dataDir, filename);
  try {
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(target, `${secret}\n`, { mode: 0o600 });
    return secret;
  } catch (error) {
    throw new Error(
      `Could not read or create ${target}. Mount a writable data volume at DATA_DIR.`,
      { cause: error },
    );
  }
}

const sessionSecret =
  process.env.SESSION_SECRET || persistSecret('session-secret');
const streamSecret =
  process.env.STREAM_SECRET || persistSecret('stream-secret');

// The portable auth module reads these directly from process.env.
process.env.SESSION_SECRET = sessionSecret;
process.env.SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || 'modulate.sid';
process.env.MOBILE_AUTH_ENABLED =
  process.env.MOBILE_AUTH_ENABLED || 'true';
process.env.MOBILE_AUTH_AUTO_CREATE_TABLE =
  process.env.MOBILE_AUTH_AUTO_CREATE_TABLE || 'true';
process.env.MOBILE_TOKEN_PREFIX =
  process.env.MOBILE_TOKEN_PREFIX || 'mod_ctl_';

const booleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => String(value).toLowerCase() === 'true');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://modulate:modulate@localhost:5433/modulate'),
  INGEST_WORKER_ENABLED: booleanString.default(true),
  MAX_INGEST_ITEMS: z.coerce.number().int().min(1).max(2000).default(200),
  YTDLP_PATH: z.string().min(1).default('yt-dlp'),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  MUSIC_ROOT: z.string().min(1).default('/music'),
  STREAM_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(21_600),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

module.exports = {
  ...data,
  NODE_ENV: nodeEnv,
  APP_NAME: 'Modulate',
  APP_SLUG: 'modulate',
  DATA_DIR: dataDir,
  MEDIA_ROOT: mediaRoot,
  MUSIC_ROOT: path.resolve(process.env.MUSIC_ROOT || '/music'),
  SESSION_SECRET: sessionSecret,
  STREAM_SECRET: streamSecret,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  // The app always sits behind a reverse proxy in production. Trusting one
  // proxy is enough for secure cookies and correct absolute media URLs.
  trustProxy: 1,
};
