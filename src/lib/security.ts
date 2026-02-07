/**
 * Security utilities for the 7th Floor Digital website
 */

/**
 * HTML entity encoding to prevent XSS/HTML injection
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return str.replace(/[&<>"'/]/g, (char) => htmlEntities[char]);
}

/**
 * Sanitize input for email content
 * - Trims whitespace
 * - Limits length
 * - Escapes HTML entities
 */
export function sanitizeForEmail(str: string, maxLength: number = 5000): string {
  return escapeHtml(str.trim().slice(0, maxLength));
}

/**
 * CSRF protection: validate request origin
 */
export function isValidOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const allowedOrigins = [
    'https://7thfloor.digital',
    'https://www.7thfloor.digital',
    'https://brokedown.app',
    'https://www.brokedown.app',
  ];

  // Allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000');
    allowedOrigins.push('http://127.0.0.1:3000');
  }

  // Check origin header first
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  // Fall back to referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      return allowedOrigins.includes(refererOrigin);
    } catch {
      return false;
    }
  }

  // No origin or referer - reject
  return false;
}

/**
 * Safe error logging - no stack traces in production
 */
export function logError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString();

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${timestamp}] ${context}:`, error);
  } else {
    // In production, log only safe info (no stack traces)
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${timestamp}] ${context}: ${message}`);
  }
}
