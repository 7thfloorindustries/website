/**
 * Cloudflare Turnstile verification
 * https://developers.cloudflare.com/turnstile/
 */

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token server-side
 * Returns true if verification succeeds or if Turnstile is not configured (dev mode)
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Skip verification in development if no secret key configured
  if (!secretKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Turnstile] Skipping verification - no secret key configured');
      return { success: true };
    }
    // In production without a key, fail closed
    return { success: false, error: 'Turnstile not configured' };
  }

  // If no token provided, fail
  if (!token) {
    return { success: false, error: 'No Turnstile token provided' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Turnstile API request failed' };
    }

    const data: TurnstileVerifyResponse = await response.json();

    if (data.success) {
      return { success: true };
    }

    const errorCodes = data['error-codes'] || [];
    return {
      success: false,
      error: `Turnstile verification failed: ${errorCodes.join(', ') || 'unknown error'}`
    };
  } catch (error) {
    console.error('[Turnstile] Verification error:', error);
    return { success: false, error: 'Turnstile verification request failed' };
  }
}

/**
 * Check if Turnstile is enabled (has site key configured)
 */
export function isTurnstileEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
