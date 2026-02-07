const DISALLOWED_HOST_PATTERNS = [
  /(^|\.)example\.com$/i,
  /(^|\.)example\.org$/i,
  /(^|\.)example\.net$/i,
];

const ALLOWED_SOCIAL_HOST_PATTERNS = [
  /(^|\.)tiktok\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
  /(^|\.)soundcloud\.com$/i,
  /(^|\.)spotify\.com$/i,
];

export type UrlValidityReason =
  | 'valid'
  | 'missing_url'
  | 'invalid_url'
  | 'disallowed_domain'
  | 'unsupported_domain';

export interface UrlValidityResult {
  host: string | null;
  isValid: boolean;
  reason: UrlValidityReason;
}

function parseHost(input: string): string | null {
  try {
    const parsed = new URL(input);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isDisallowedHost(host: string): boolean {
  return DISALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function isAllowedSocialHost(host: string): boolean {
  return ALLOWED_SOCIAL_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function validatePostUrl(url: string | null | undefined): UrlValidityResult {
  if (!url || !url.trim()) {
    return { isValid: false, reason: 'missing_url', host: null };
  }

  const host = parseHost(url.trim());
  if (!host) {
    return { isValid: false, reason: 'invalid_url', host: null };
  }
  if (isDisallowedHost(host)) {
    return { isValid: false, reason: 'disallowed_domain', host };
  }
  if (!isAllowedSocialHost(host)) {
    return { isValid: false, reason: 'unsupported_domain', host };
  }

  return { isValid: true, reason: 'valid', host };
}
