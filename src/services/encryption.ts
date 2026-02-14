/**
 * Client-side encryption service for Git tokens
 * 
 * Uses AES-256-GCM encryption with keys derived from a user passphrase
 * using PBKDF2 with SHA-256 and 100,000 iterations.
 */

import type { EncryptedData } from '../types/git';

const SALT_LENGTH = 16;           // 128 bits
const IV_LENGTH = 12;             // 96 bits for GCM
const ITERATIONS = 100000;        // PBKDF2 iterations

// Storage key for session passphrase
const PASSPHRASE_STORAGE_KEY = 'timesheet_git_passphrase';
const PASSPHRASE_EXPIRY_KEY = 'timesheet_git_passphrase_expiry';

// Session duration: 8 hours
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Derive an encryption key from passphrase and salt using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseData = encoder.encode(passphrase);

  // Import passphrase as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseData,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt a Git token using AES-256-GCM
 * 
 * @param token - The plain Git token to encrypt
 * @param passphrase - The user's passphrase
 * @returns Object containing encrypted data and IV (as base64 strings)
 */
export async function encryptToken(token: string, passphrase: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(token);
  
  // Generate random salt and IV
  const salt = generateSalt();
  const iv = generateIV();
  
  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt);
  
  // Encrypt the token
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    tokenData
  );
  
  // Combine salt + ciphertext for storage
  // Format: [salt (16 bytes)][ciphertext (variable)]
  const combined = new Uint8Array(salt.length + encryptedBuffer.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(encryptedBuffer), salt.length);
  
  return {
    encrypted: arrayBufferToBase64(combined.buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
  
}

/**
 * Decrypt a Git token using AES-256-GCM
 * 
 * @param encryptedData - Base64 encoded encrypted data (salt + ciphertext)
 * @param iv - Base64 encoded IV
 * @param passphrase - The user's passphrase
 * @returns The decrypted token
 */
export async function decryptToken(
  encryptedData: string,
  iv: string,
  passphrase: string
): Promise<string> {
  // Decode base64
  const combined = base64ToUint8Array(encryptedData);
  const ivBytes = base64ToUint8Array(iv);
  
  // Extract salt (first 16 bytes) and ciphertext
  const salt = combined.slice(0, SALT_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH);
  
  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt);
  
  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes.buffer as ArrayBuffer,
    },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  
  // Decode result
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Store the passphrase securely in sessionStorage with expiry
 * 
 * @param passphrase - The user's passphrase
 * @param durationMs - How long to keep it (default: 8 hours)
 */
export function storePassphrase(passphrase: string, durationMs: number = SESSION_DURATION_MS): void {
  try {
    const expiry = Date.now() + durationMs;
    sessionStorage.setItem(PASSPHRASE_STORAGE_KEY, passphrase);
    sessionStorage.setItem(PASSPHRASE_EXPIRY_KEY, expiry.toString());
  } catch (error) {
    console.error('Failed to store passphrase:', error);
  }
}

/**
 * Get the stored passphrase if it hasn't expired
 * 
 * @returns The passphrase or null if not found/expired
 */
export function getStoredPassphrase(): string | null {
  try {
    const passphrase = sessionStorage.getItem(PASSPHRASE_STORAGE_KEY);
    const expiryStr = sessionStorage.getItem(PASSPHRASE_EXPIRY_KEY);
    
    if (!passphrase || !expiryStr) {
      return null;
    }
    
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) {
      // Expired, clear it
      clearStoredPassphrase();
      return null;
    }
    
    return passphrase;
  } catch (error) {
    console.error('Failed to get stored passphrase:', error);
    return null;
  }
}

/**
 * Clear the stored passphrase
 */
export function clearStoredPassphrase(): void {
  try {
    sessionStorage.removeItem(PASSPHRASE_STORAGE_KEY);
    sessionStorage.removeItem(PASSPHRASE_EXPIRY_KEY);
  } catch (error) {
    console.error('Failed to clear passphrase:', error);
  }
}

/**
 * Check if a passphrase is stored and valid
 */
export function hasValidPassphrase(): boolean {
  return getStoredPassphrase() !== null;
}

/**
 * Get remaining time for stored passphrase in milliseconds
 */
export function getPassphraseRemainingTime(): number {
  try {
    const expiryStr = sessionStorage.getItem(PASSPHRASE_EXPIRY_KEY);
    if (!expiryStr) return 0;
    
    const expiry = parseInt(expiryStr, 10);
    return Math.max(0, expiry - Date.now());
  } catch {
    return 0;
  }
}

/**
 * Encryption service object for convenience
 */
export const encryptionService = {
  encryptToken,
  decryptToken,
  storePassphrase,
  getStoredPassphrase,
  clearStoredPassphrase,
  hasValidPassphrase,
  getPassphraseRemainingTime,
};

export default encryptionService;
