import { createHmac, randomBytes } from 'crypto';

const CSRF_SECRET = process.env.CSRF_SECRET || 'dev-csrf-secret-change-in-production';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a CSRF token with timestamp
 * Format: timestamp.signature
 */
export function generateCsrfToken(): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(timestamp)
    .digest('hex');

  return `${timestamp}.${signature}`;
}

/**
 * Validate a CSRF token
 * Checks signature and expiry
 */
export function validateCsrfToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [timestamp, signature] = parts;

  // Check if timestamp is valid
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime)) {
    return false;
  }

  // Check expiry
  if (Date.now() - tokenTime > TOKEN_EXPIRY_MS) {
    return false;
  }

  // Verify signature
  const expectedSignature = createHmac('sha256', CSRF_SECRET)
    .update(timestamp)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a random token for cookie value
 */
export function generateRandomToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate double-submit cookie pattern
 * Token from body must match token from cookie
 */
export function validateDoubleSubmit(bodyToken: string, cookieToken: string): boolean {
  if (!bodyToken || !cookieToken) {
    return false;
  }

  // First validate the token format and signature
  if (!validateCsrfToken(bodyToken)) {
    return false;
  }

  // Then check that body and cookie tokens match
  if (bodyToken.length !== cookieToken.length) {
    return false;
  }

  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < bodyToken.length; i++) {
    result |= bodyToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }

  return result === 0;
}
