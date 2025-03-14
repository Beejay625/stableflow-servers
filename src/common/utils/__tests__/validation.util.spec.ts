import { isValidEmail,  isValidPhoneNumber } from '../validation.util';

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      // Given
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.com',
        'user123@subdomain.domain.com'
      ];

      // When/Then
      validEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(true);
      });
    });

    it('should return false for invalid email addresses', () => {
      // Given
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user@.com',
        'user@domain.',
        'user name@domain.com',
        'user@domain..com'
      ];

      // When/Then
      invalidEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(false);
      });
    });

    it('should return false for empty or null values', () => {
      // Given
      const emptyValues = ['', null, undefined];

      // When/Then
      emptyValues.forEach(value => {
        expect(isValidEmail(value as string)).toBe(false);
      });
    });

    it('should handle email addresses with special characters correctly', () => {
      // Given
      const specialEmails = {
        'user.name+tag@example.com': true,
        'user-name@domain.com': true,
        'user_name@domain.com': true,
        'user!name@domain.com': true,
        'user space@domain.com': false,
        'user..name@domain.com': false,
        'user@domain..com': false
      };

      // When/Then
      Object.entries(specialEmails).forEach(([email, expected]) => {
        expect(isValidEmail(email)).toBe(expected);
      });
    });
  });

  

  describe('isValidPhoneNumber', () => {
    it('should return true for valid phone numbers', () => {
      expect(isValidPhoneNumber('+1234567890')).toBe(true);
      expect(isValidPhoneNumber('+44 20 7123 4567')).toBe(true);
    });

    it('should return false for invalid phone numbers', () => {
      expect(isValidPhoneNumber('invalid')).toBe(false);
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });
}); 