import { formatInTimeZone } from 'date-fns-tz';

const BRAZIL_TZ = 'America/Sao_Paulo';

/**
 * Get today's date in Brazil timezone
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayInBrazil(): string {
  return formatInTimeZone(new Date(), BRAZIL_TZ, 'yyyy-MM-dd');
}

/**
 * Convert a date to Brazil timezone
 * @param date - Date to convert
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateInBrazil(date: Date): string {
  return formatInTimeZone(date, BRAZIL_TZ, 'yyyy-MM-dd');
}
