/**
 * Calendar-date helpers for the browser. Planning dates are local dates, not
 * UTC instants, so never use toISOString() for "today" in the UI.
 */
export function dateInZone(timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString('en-CA');
  }
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function tomorrowInZone(timeZone?: string | null): string {
  return addDays(dateInZone(timeZone), 1);
}
