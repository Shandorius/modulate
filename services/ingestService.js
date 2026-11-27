const dns = require('dns/promises');
const net = require('net');
const { pool } = require('../db/pool');
const { badRequest, notFound, conflict } = require('./errors');
const env = require('../config/env');

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  return true;
}

async function validateSourceUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw badRequest('Enter a valid http or https URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw badRequest('Only http and https URLs can be imported.');
  }
  if (url.username || url.password) {
    throw badRequest('URLs with embedded credentials are not supported.');
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw badRequest('Local and private addresses cannot be imported.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw badRequest('Local and private addresses cannot be imported.');
    }
  } else {
    let addresses;
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw badRequest('That host could not be resolved.');
    }
    if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
      throw badRequest('Local and private addresses cannot be imported.');
    }
  }
  return url.toString();
}

function presentJob(row) {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    sourceKind: row.source_kind,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    title: row.title,
    itemCount: row.item_count,
    resultCount: row.result_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

async function create(userId, input) {
  const sourceUrl = await validateSourceUrl(input.url);
  const sourceKind = ['auto', 'track', 'playlist'].includes(input.kind)
    ? input.kind
    : 'auto';
  const { rows: active } = await pool.query(
    `SELECT count(*)::int AS count FROM ingest_jobs
     WHERE user_id = $1 AND status IN ('queued', 'running')`,
    [userId],
  );
  if (Number(active[0]?.count) >= 3) {
    throw conflict('Three imports are already waiting. Let one finish first.');
  }
  const { rows } = await pool.query(
    `INSERT INTO ingest_jobs (user_id, source_url, source_kind)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, sourceUrl, sourceKind],
  );
  return presentJob(rows[0]);
}

async function list(userId, { limit = 30 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM ingest_jobs WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 30, 1), 100)],
  );
  return rows.map(presentJob);
}

async function get(userId, jobId) {
  const { rows } = await pool.query(
    'SELECT * FROM ingest_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId],
  );
  if (!rows[0]) throw notFound('Import job not found.');
  return presentJob(rows[0]);
}

async function retry(userId, jobId) {
  const { rows } = await pool.query(
    `UPDATE ingest_jobs
     SET status = 'queued', stage = 'Waiting', progress = 0,
         error_message = NULL, started_at = NULL, finished_at = NULL
     WHERE id = $1 AND user_id = $2 AND status IN ('failed', 'cancelled')
     RETURNING *`,
    [jobId, userId],
  );
  if (!rows[0]) {
    const existing = await get(userId, jobId).catch(() => null);
    if (!existing) throw notFound('Import job not found.');
    throw conflict('Only a failed or cancelled import can be retried.');
  }
  return presentJob(rows[0]);
}

async function cancel(userId, jobId) {
  const { rows } = await pool.query(
    `UPDATE ingest_jobs
     SET status = 'cancelled', stage = 'Cancelled', finished_at = now()
     WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running')
     RETURNING *`,
    [jobId, userId],
  );
  if (!rows[0]) {
    const existing = await get(userId, jobId).catch(() => null);
    if (!existing) throw notFound('Import job not found.');
    throw conflict('That import has already finished.');
  }
  return presentJob(rows[0]);
}

module.exports = {
  create,
  list,
  get,
  retry,
  cancel,
  validateSourceUrl,
  presentJob,
  isPrivateIp,
  maxItems: env.MAX_INGEST_ITEMS,
};
