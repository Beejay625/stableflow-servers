/**
 * String utility functions for consistent string operations across the application
 */

/**
 * Normalizes an email address by converting it to lowercase
 * This ensures case-insensitive email handling throughout the application
 *
 * @param email The email address to normalize
 * @returns The normalized (lowercase) email address
 */
export function normalizeEmail(email: string): string {
  if (!email) return email;
  return email.toLowerCase().trim();
}

/**
 * Checks if a string looks like a valid email address
 *
 * @param email The string to validate as an email
 * @returns True if the string is a valid email format
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  // Basic email regex - can be enhanced for more strict validation if needed
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Truncates a string to a maximum length, adding ellipsis if truncated
 *
 * @param str The string to truncate
 * @param maxLength Maximum length before truncation
 * @returns Truncated string with ellipsis if needed
 */
export function truncateString(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}
