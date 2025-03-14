import { isPhoneNumber, IsPhoneNumber } from "class-validator";

/**
 * Validates if a string is a properly formatted email address.
 * @param email - The email string to validate
 * @returns boolean - True if the email is valid, false otherwise
 */
export const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  
  // Check for common invalid patterns first
  if (email.includes('..') || email.includes(' ')) return false;
  
  // RFC 5322 compliant email regex that allows for most valid email formats
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}; 

/**
 * Validate if a string is properly a formatted phone number 
 * @param phoneNumber - The phone number string to validate 
 * @returns boolean - True if the phone number is valid false otherwise 
 */
export const isValidPhoneNumber = (phoneNumber: string): boolean => {
  if (!phoneNumber) return false;
  // This regex matches international phone numbers with optional country code and spaces
  const phoneNumberRegex = /^\+?[1-9]\d{1,14}$/;
  const cleanNumber = phoneNumber.replace(/[\s-]/g, '');
  return phoneNumberRegex.test(cleanNumber) && cleanNumber.length >= 7;
};