/**
 * Format date to EST/EDT timezone (America/New_York)
 * Used consistently across the app for displaying game start times
 */
export function formatDateEST(date: Date | string): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(dateObj);
  } catch {
    return typeof date === 'string' ? date : date.toISOString();
  }
}

/**
 * Format date to EST/EDT timezone with full date and time
 */
export function formatDateTimeEST(date: Date | string): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(dateObj);
  } catch {
    return typeof date === 'string' ? date : date.toISOString();
  }
}

