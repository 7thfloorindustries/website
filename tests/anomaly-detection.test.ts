import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

/**
 * Anomaly detection logic for metric drops.
 * This is tested standalone since src/lib/anomaly.ts does not exist yet.
 * When the module is created, these tests should import from it instead.
 */

type AnomalyLevel = 'normal' | 'suspicious_drop' | 'likely_error';

interface AnomalyResult {
  level: AnomalyLevel;
  dropPercent: number;
}

function detectAnomaly(previousFollowers: number, currentFollowers: number): AnomalyResult {
  if (previousFollowers === 0) {
    // Avoid division by zero; if previous was 0, any positive value is just growth
    return { level: 'normal', dropPercent: 0 };
  }

  const dropPercent = ((previousFollowers - currentFollowers) / previousFollowers) * 100;

  if (dropPercent >= 90) {
    return { level: 'likely_error', dropPercent };
  }
  if (dropPercent >= 50) {
    return { level: 'suspicious_drop', dropPercent };
  }
  return { level: 'normal', dropPercent };
}

describe('anomaly detection', () => {
  test('normal fluctuation (5% drop) does not trigger', () => {
    const result = detectAnomaly(1000, 950);
    assert.equal(result.level, 'normal');
    assert.equal(result.dropPercent, 5);
  });

  test('normal fluctuation (10% drop) does not trigger', () => {
    const result = detectAnomaly(1000, 900);
    assert.equal(result.level, 'normal');
    assert.equal(result.dropPercent, 10);
  });

  test('growth (negative drop) is normal', () => {
    const result = detectAnomaly(1000, 1200);
    assert.equal(result.level, 'normal');
    assert.ok(result.dropPercent < 0);
  });

  test('49% drop is still normal', () => {
    const result = detectAnomaly(1000, 510);
    assert.equal(result.level, 'normal');
    assert.ok(result.dropPercent < 50);
  });

  test('50% drop triggers suspicious_drop', () => {
    const result = detectAnomaly(1000, 500);
    assert.equal(result.level, 'suspicious_drop');
    assert.equal(result.dropPercent, 50);
  });

  test('75% drop triggers suspicious_drop', () => {
    const result = detectAnomaly(1000, 250);
    assert.equal(result.level, 'suspicious_drop');
    assert.equal(result.dropPercent, 75);
  });

  test('89% drop triggers suspicious_drop (not likely_error)', () => {
    const result = detectAnomaly(1000, 110);
    assert.equal(result.level, 'suspicious_drop');
    assert.ok(result.dropPercent < 90);
  });

  test('90% drop triggers likely_error', () => {
    const result = detectAnomaly(1000, 100);
    assert.equal(result.level, 'likely_error');
    assert.equal(result.dropPercent, 90);
  });

  test('95% drop triggers likely_error', () => {
    const result = detectAnomaly(10000, 500);
    assert.equal(result.level, 'likely_error');
    assert.equal(result.dropPercent, 95);
  });

  test('100% drop (to zero) triggers likely_error', () => {
    const result = detectAnomaly(1000, 0);
    assert.equal(result.level, 'likely_error');
    assert.equal(result.dropPercent, 100);
  });

  test('previous value is 0 avoids division by zero', () => {
    const result = detectAnomaly(0, 500);
    assert.equal(result.level, 'normal');
    assert.equal(result.dropPercent, 0);
  });

  test('both values are 0 is normal', () => {
    const result = detectAnomaly(0, 0);
    assert.equal(result.level, 'normal');
    assert.equal(result.dropPercent, 0);
  });

  test('no change is normal', () => {
    const result = detectAnomaly(1000, 1000);
    assert.equal(result.level, 'normal');
    assert.equal(result.dropPercent, 0);
  });

  test('small absolute values with large percentage drop', () => {
    // 2 -> 0 is a 100% drop, should be likely_error
    const result = detectAnomaly(2, 0);
    assert.equal(result.level, 'likely_error');
    assert.equal(result.dropPercent, 100);
  });
});
