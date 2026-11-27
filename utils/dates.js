/**
 * Timezone-safe date helpers shared by services.
 */
function isValidTimezone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function todayInZone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: isValidTimezone(timeZone) ? timeZone : 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

module.exports = { isValidTimezone, todayInZone, formatDateOnly };
