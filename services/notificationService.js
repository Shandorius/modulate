/**
 * Local notification planning.
 *
 * The OS delivers local notifications. This service only decides what should
 * be scheduled for the next few days. App-specific rules live in
 * `services/notificationRules.js`.
 */
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { badRequest } = require('./errors');
const rules = require('./notificationRules');
const { isValidTimezone } = require('../utils/dates');

const BANNED_WORDS = [
  'overdue',
  'failed',
  'missed',
  'behind',
  'lost',
  'last chance',
  "don't break",
];

function parseTime(value, fallback = '00:00') {
  const text = String(value || fallback).slice(0, 5);
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

function formatMinutes(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimezone(timeZone) ? timeZone : 'UTC',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour) % 24;
  const localDate = `${map.year}-${map.month}-${map.day}`;
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return {
    date: localDate,
    minutes: hour * 60 + Number(map.minute),
    weekday,
    hour,
  };
}

function inQuietHours(minutes, start, end) {
  const quietStart = parseTime(start);
  const quietEnd = parseTime(end);
  if (quietStart === null || quietEnd === null || quietStart === quietEnd) {
    return false;
  }
  if (quietStart < quietEnd) {
    return minutes >= quietStart && minutes < quietEnd;
  }
  return minutes >= quietStart || minutes < quietEnd;
}

function isBannedCopy(text) {
  const lower = String(text || '').toLowerCase();
  return BANNED_WORDS.some((word) => lower.includes(word));
}

function presentPreferences(row) {
  if (!row) return null;
  return {
    pushEnabled: row.push_enabled,
    morningPlan: row.morning_plan,
    morningTime: String(row.morning_time).slice(0, 5),
    quietStart: String(row.quiet_start).slice(0, 5),
    quietEnd: String(row.quiet_end).slice(0, 5),
    dayEnd: String(row.day_end).slice(0, 5),
    maxPerDay: row.max_per_day,
    hideDetails: row.hide_details,
  };
}

async function ensurePreferences(userId, db = pool) {
  await db.query(
    `INSERT INTO notification_preferences (user_id)
     VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await db.query(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

async function getPreferences(userId, db = pool) {
  return presentPreferences(await ensurePreferences(userId, db));
}

async function updatePreferences(userId, input, db = pool) {
  await ensurePreferences(userId, db);
  const sets = [];
  const values = [];
  const push = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  for (const [inputKey, column] of [
    ['pushEnabled', 'push_enabled'],
    ['morningPlan', 'morning_plan'],
    ['hideDetails', 'hide_details'],
  ]) {
    if (input[inputKey] !== undefined) push(column, Boolean(input[inputKey]));
  }

  for (const [inputKey, column] of [
    ['morningTime', 'morning_time'],
    ['quietStart', 'quiet_start'],
    ['quietEnd', 'quiet_end'],
    ['dayEnd', 'day_end'],
  ]) {
    if (input[inputKey] !== undefined) {
      const minutes = parseTime(input[inputKey]);
      if (minutes === null) throw badRequest(`${inputKey} must be HH:MM.`);
      push(column, formatMinutes(minutes));
    }
  }

  if (input.maxPerDay !== undefined) {
    const value = Number(input.maxPerDay);
    if (![1, 2].includes(value)) throw badRequest('maxPerDay must be 1 or 2.');
    push('max_per_day', value);
  }

  if (sets.length === 0) return getPreferences(userId, db);
  values.push(userId);
  const { rows } = await db.query(
    `UPDATE notification_preferences SET ${sets.join(', ')}
     WHERE user_id = $${values.length} RETURNING *`,
    values,
  );
  return presentPreferences(rows[0]);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateString) {
  return new Date(`${dateString}T00:00:00Z`).getUTCDay();
}

function timezoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  if (name === 'GMT' || name === 'UTC') return 0;
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function zonedDateTimeToUtc(dateString, minutes, timeZone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guessed = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = timezoneOffsetMinutes(new Date(guessed), timeZone);
  let utc = guessed - firstOffset * 60_000;
  const secondOffset = timezoneOffsetMinutes(new Date(utc), timeZone);
  if (secondOffset !== firstOffset) utc = guessed - secondOffset * 60_000;
  return new Date(utc);
}

async function buildLocalPlan(
  userId,
  { days = 7, now = new Date() } = {},
  db = pool,
) {
  const preferencesRow = await ensurePreferences(userId, db);
  const preferences = presentPreferences(preferencesRow);
  const { rows: profileRows } = await db.query(
    'SELECT timezone FROM user_profiles WHERE user_id = $1',
    [userId],
  );
  const timezone = profileRows[0]?.timezone || 'UTC';
  preferences.timezone = timezone;
  const horizon = Math.max(1, Math.min(Number(days) || 7, 7));

  if (!preferences.pushEnabled) {
    return {
      timezone,
      generatedAt: now.toISOString(),
      days: horizon,
      notifications: [],
    };
  }

  const nowParts = zonedParts(now, timezone);
  const notifications = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(nowParts.date, offset);
    const dayOfWeek = weekdayOf(date);
    const raw = await rules.candidatesForDate({
      userId,
      date,
      dayOfWeek,
      preferences,
      db,
      now,
    });

    const candidates = (Array.isArray(raw) ? raw : [])
      .filter((candidate) => {
        return (
          candidate &&
          typeof candidate.key === 'string' &&
          candidate.key.length > 0 &&
          typeof candidate.title === 'string' &&
          typeof candidate.body === 'string' &&
          Number.isInteger(candidate.scheduledMinutes) &&
          candidate.scheduledMinutes >= 0 &&
          candidate.scheduledMinutes < 24 * 60
        );
      })
      .filter(
        (candidate) =>
          !inQuietHours(
            candidate.scheduledMinutes,
            preferences.quietStart,
            preferences.quietEnd,
          ),
      )
      .filter(
        (candidate) =>
          !isBannedCopy(`${candidate.title} ${candidate.body}`),
      )
      .map((candidate) => ({
        key: candidate.key,
        kind: candidate.kind || 'reminder',
        title: candidate.title,
        body: candidate.body,
        scheduledAt: zonedDateTimeToUtc(
          date,
          candidate.scheduledMinutes,
          timezone,
        ).toISOString(),
        ...(candidate.actionTypeId
          ? { actionTypeId: candidate.actionTypeId }
          : {}),
        data: candidate.data || {},
      }))
      .filter((candidate) => new Date(candidate.scheduledAt).getTime() > now.getTime())
      .slice(0, preferences.maxPerDay);

    notifications.push(...candidates);
  }

  notifications.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  return {
    timezone,
    generatedAt: now.toISOString(),
    days: horizon,
    notifications,
  };
}

async function history(userId, { limit = 20 } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM notification_log
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Number(limit) || 20, 100)],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    skipReason: row.skip_reason,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }));
}

async function sendTest(userId, db = pool) {
  const preferences = await ensurePreferences(userId, db);
  const now = new Date();
  const { rows: profileRows } = await db.query(
    'SELECT timezone FROM user_profiles WHERE user_id = $1',
    [userId],
  );
  const localDate = zonedParts(now, profileRows[0]?.timezone || 'UTC').date;
  const title = preferences.hide_details
    ? 'New notification'
    : 'Test notification';
  const body = 'Local notifications are working.';
  const { rows } = await db.query(
    `INSERT INTO notification_log
       (user_id, kind, title, body, data, dedupe_key, local_date,
        scheduled_for, status, sent_at)
     VALUES ($1, 'test', $2, $3, $4, $5, $6, $7, 'sent', now())
     RETURNING *`,
    [
      userId,
      title,
      body,
      { kind: 'test', route: '/app/home' },
      `test:${crypto.randomUUID()}`,
      localDate,
      now,
    ],
  );
  return { log: rows[0], driver: 'local' };
}

module.exports = {
  getPreferences,
  updatePreferences,
  history,
  buildLocalPlan,
  sendTest,
  zonedParts,
  inQuietHours,
  isBannedCopy,
};
