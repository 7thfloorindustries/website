import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const HASH_ALGO = 'scrypt';
const HASH_KEYLEN = 64;
const HASH_DELIMITER = '$';

function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

export function hashInfluencerPassword(password: string, providedSalt?: string): string {
  const salt = providedSalt ?? randomBytes(16).toString('base64url');
  const digest = scryptSync(normalizePassword(password), salt, HASH_KEYLEN).toString('hex');
  return `${HASH_ALGO}${HASH_DELIMITER}${salt}${HASH_DELIMITER}${digest}`;
}

export function verifyInfluencerPassword(password: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;

  const [algo, salt, digest] = storedHash.split(HASH_DELIMITER);
  if (algo !== HASH_ALGO || !salt || !digest) return false;

  const computed = scryptSync(normalizePassword(password), salt, HASH_KEYLEN).toString('hex');
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(digest, 'hex'));
  } catch {
    return false;
  }
}

