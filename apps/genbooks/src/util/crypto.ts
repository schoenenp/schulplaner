import crypto from 'node:crypto';
import { env } from "@/env";

function getEncryptionKey(): Buffer {
  // Derive a stable 32-byte key from configured secret material.
  return crypto.createHash("sha256").update(env.CANCEL_SECRET).digest();
}

/**
 * Encrypts a JSON payload using AES-GCM.
 * @param payload The JSON object to encrypt.
 * @returns A Promise that resolves with the encrypted data as a base64 string.
 */
export function encryptPayload(payload: object): string {
  const iv = crypto.randomBytes(12);
  const keyBuffer = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8');
  const ciphertext = Buffer.concat([
    cipher.update(encodedPayload),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedBytes = Buffer.concat([iv, ciphertext, tag]);

  const base64 = encryptedBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return base64;
}

/**
 * Decrypts a base64 encoded string using AES-GCM.
 * @param encryptedBase64 The base64 encoded string to decrypt.
 * @returns A Promise that resolves with the decrypted JSON object.
 */
export async function decryptPayload<T>(encryptedBase64: string): Promise<T> {
  const base64 = encryptedBase64.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4 === 0 ? 0 : 4 - (base64.length % 4);
  const paddedBase64 = base64 + '='.repeat(padding);

  const encryptedBytes = Buffer.from(paddedBase64, 'base64');
  const iv = encryptedBytes.slice(0, 12);
  const tag = encryptedBytes.slice(encryptedBytes.length - 16);
  const ciphertext = encryptedBytes.slice(12, encryptedBytes.length - 16);

  const keyBuffer = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(tag);

  const decryptedData = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decryptedData.toString('utf-8')) as T;
}
