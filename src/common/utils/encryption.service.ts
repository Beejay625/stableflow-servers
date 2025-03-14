import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key = crypto.scryptSync('test-key', 'salt', 32);

  /**
   * Encrypt data
   * @param text - Text to encrypt
   * @param iv - Initialization vector
   * @returns Encrypted data
   */
  encrypt(text: string, iv: string): string {
    const ivBuffer = Buffer.from(iv.padEnd(16, '0').slice(0, 16));
    const cipher = crypto.createCipheriv(this.algorithm, this.key, ivBuffer);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt data
   * @param encryptedText - Text to decrypt
   * @param iv - Initialization vector
   * @returns Decrypted data
   */
  decrypt(encryptedText: string, iv: string): string {
    const ivBuffer = Buffer.from(iv.padEnd(16, '0').slice(0, 16));
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, ivBuffer);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
} 