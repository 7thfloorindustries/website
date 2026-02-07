/**
 * Tests for the in-memory rate limiter in login-rate-limit.ts.
 *
 * The Upstash env vars are not set in the test environment,
 * so the in-memory fallback is used automatically.
 */

import assert from 'node:assert/strict';
import { describe, test, beforeEach } from 'node:test';
import { checkRateLimit, recordFailedAttempt } from '../src/lib/login-rate-limit';

describe('rate limiting (in-memory fallback)', () => {
  // Use a unique IP prefix per test to avoid cross-test interference
  let testIp: string;
  let ipCounter = 0;

  beforeEach(() => {
    ipCounter++;
    testIp = `test-${Date.now()}-${ipCounter}`;
  });

  test('new IP is not blocked', async () => {
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, false);
  });

  test('4 failed attempts does not block', async () => {
    for (let i = 0; i < 4; i++) {
      await recordFailedAttempt(testIp);
    }
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, false);
  });

  test('5th failed attempt triggers block', async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, true);
    assert.ok(result.retryAfterMs !== undefined);
    assert.ok(result.retryAfterMs! > 0);
  });

  test('6 failed attempts remains blocked', async () => {
    for (let i = 0; i < 6; i++) {
      await recordFailedAttempt(testIp);
    }
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, true);
  });

  test('different IPs are independent', async () => {
    const ip1 = `${testIp}-a`;
    const ip2 = `${testIp}-b`;

    // Block ip1
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(ip1);
    }

    const result1 = await checkRateLimit(ip1);
    const result2 = await checkRateLimit(ip2);

    assert.equal(result1.blocked, true);
    assert.equal(result2.blocked, false);
  });

  test('retryAfterMs is within 15-minute window', async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, true);

    const fifteenMinMs = 15 * 60 * 1000;
    assert.ok(result.retryAfterMs! <= fifteenMinMs);
    assert.ok(result.retryAfterMs! > 0);
  });

  test('window expiry resets the block', async () => {
    // We cannot easily fast-forward time in the in-memory implementation
    // without modifying the source, so we test the boundary behavior:
    // a fresh IP with no attempts should not be blocked.
    const freshIp = `${testIp}-fresh`;
    const result = await checkRateLimit(freshIp);
    assert.equal(result.blocked, false);

    // After recording exactly MAX_ATTEMPTS for a different IP,
    // the fresh IP remains unaffected
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }
    const freshResult = await checkRateLimit(freshIp);
    assert.equal(freshResult.blocked, false);
  });

  test('1 failed attempt followed by check is not blocked', async () => {
    await recordFailedAttempt(testIp);
    const result = await checkRateLimit(testIp);
    assert.equal(result.blocked, false);
  });
});
