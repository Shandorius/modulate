/**
 * Local reminder candidates for Modulate.
 *
 * Notifications never tell someone they are behind. They either point back to
 * music that is already in the library or mention that a recent import is
 * ready. The notification service handles quiet hours, future-only filtering,
 * the daily cap, and shame-language linting.
 */
async function candidatesForDate({ userId, preferences, db }) {
  if (!preferences?.morningPlan) return [];
  const candidates = [];

  const { rows: lastPlayed } = await db.query(
    `SELECT max(played_at) AS played_at
     FROM play_history
     WHERE user_id = $1`,
    [userId],
  );
  const last = lastPlayed[0]?.played_at
    ? new Date(lastPlayed[0].played_at)
    : null;
  const daysSince = last
    ? (Date.now() - last.getTime()) / 86_400_000
    : null;

  if (daysSince !== null && daysSince >= 2 && daysSince <= 21) {
    candidates.push({
      key: `continue:${userId}:${String(last.toISOString()).slice(0, 10)}`,
      kind: 'continue_listening',
      title: 'Your queue is still here',
      body: preferences.hideDetails
        ? 'Open Modulate when you have a moment.'
        : 'Pick up where you left off in your library.',
      scheduledMinutes: 18 * 60 + 30,
      data: { route: '/app/home' },
    });
  }

  const { rows: imported } = await db.query(
    `SELECT count(*)::int AS count
     FROM tracks
     WHERE created_at > now() - interval '24 hours'`,
    [],
  );
  if (Number(imported[0]?.count) > 0) {
    candidates.push({
      key: `new-music:${userId}:${new Date().toISOString().slice(0, 10)}`,
      kind: 'new_music',
      title: 'New music is in your library',
      body: preferences.hideDetails
        ? 'Open Modulate to see what is new.'
        : `${imported[0].count === 1 ? 'A new track is' : `${imported[0].count} new tracks are`} ready to play.`,
      scheduledMinutes: 9 * 60 + 30,
      data: { route: '/app/library' },
    });
  }

  return candidates;
}

module.exports = { candidatesForDate };
