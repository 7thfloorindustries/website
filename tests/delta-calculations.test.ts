import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  calculateDeltas,
  calculateRangeGrowth,
  buildGrowthTrendData,
} from '../src/hooks/dashboard/useGrowthCalculations';
import type { CreatorRecord } from '../src/lib/dashboard/types';

describe('calculateDeltas', () => {
  test('returns empty object for empty history', () => {
    const result = calculateDeltas([], 500);
    assert.deepEqual(result, {});
  });

  test('returns empty object for single data point', () => {
    const history = [
      { date: new Date('2026-02-01T12:00:00Z'), followers: 500 },
    ];
    const result = calculateDeltas(history, 500);
    assert.deepEqual(result, {});
  });

  test('computes 1D delta when history spans >24h', () => {
    const history = [
      { date: new Date('2026-02-01T00:00:00Z'), followers: 100 },
      { date: new Date('2026-02-03T00:00:00Z'), followers: 150 },
    ];
    const result = calculateDeltas(history, 150);
    assert.equal(result.delta1d, 50);
  });

  test('computes 7D delta when history spans >7d', () => {
    const history = [
      { date: new Date('2026-01-20T00:00:00Z'), followers: 100 },
      { date: new Date('2026-01-28T00:00:00Z'), followers: 200 },
    ];
    const result = calculateDeltas(history, 200);
    assert.equal(result.delta7d, 100);
  });

  test('returns undefined delta7d when history is less than 7 days', () => {
    const history = [
      { date: new Date('2026-02-01T00:00:00Z'), followers: 100 },
      { date: new Date('2026-02-03T00:00:00Z'), followers: 120 },
    ];
    const result = calculateDeltas(history, 120);
    assert.equal(result.delta1d, 20);
    assert.equal(result.delta7d, undefined);
  });

  test('handles negative deltas (follower loss)', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 1000 },
      { date: new Date('2026-01-10T00:00:00Z'), followers: 800 },
    ];
    const result = calculateDeltas(history, 800);
    assert.equal(result.delta1d! < 0 || result.delta7d! < 0, true);
    assert.equal(result.delta7d, -200);
  });

  test('uses most recent snapshot at least 24h old for 1D', () => {
    const history = [
      { date: new Date('2026-02-01T00:00:00Z'), followers: 100 },
      { date: new Date('2026-02-02T10:00:00Z'), followers: 130 },
      { date: new Date('2026-02-03T06:00:00Z'), followers: 140 },
      { date: new Date('2026-02-03T12:00:00Z'), followers: 150 },
    ];
    // Latest is Feb 3 12:00. 24h cutoff is Feb 2 12:00.
    // Most recent before cutoff: Feb 2 10:00 (130 followers)
    const result = calculateDeltas(history, 150);
    assert.equal(result.delta1d, 20); // 150 - 130
  });

  test('uses most recent snapshot at least 7d old for 7D', () => {
    const history = [
      { date: new Date('2026-01-20T00:00:00Z'), followers: 100 },
      { date: new Date('2026-01-25T00:00:00Z'), followers: 140 },
      { date: new Date('2026-01-28T00:00:00Z'), followers: 170 },
    ];
    // Latest is Jan 28. 7d cutoff is Jan 21.
    // Most recent before cutoff: Jan 20 (100 followers)
    const result = calculateDeltas(history, 170);
    assert.equal(result.delta7d, 70);
  });

  test('handles duplicate timestamps correctly', () => {
    const history = [
      { date: new Date('2026-02-01T00:00:00Z'), followers: 100 },
      { date: new Date('2026-02-01T00:00:00Z'), followers: 110 },
      { date: new Date('2026-02-03T00:00:00Z'), followers: 150 },
    ];
    const result = calculateDeltas(history, 150);
    // Both Feb 1 records are >24h old; newest-first sort picks one
    assert.ok(result.delta1d !== undefined);
  });

  test('handles zero follower values', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 0 },
      { date: new Date('2026-01-10T00:00:00Z'), followers: 50 },
    ];
    const result = calculateDeltas(history, 50);
    assert.equal(result.delta7d, 50);
  });
});

describe('calculateRangeGrowth', () => {
  test('returns zero growth for empty history', () => {
    const result = calculateRangeGrowth([], 500);
    assert.equal(result.growth, 0);
    assert.equal(result.growthPercent, 0);
    assert.equal(result.baselineFollowers, 500);
  });

  test('calculates growth from first entry to current', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 200 },
      { date: new Date('2026-01-10T00:00:00Z'), followers: 300 },
    ];
    const result = calculateRangeGrowth(history, 300);
    assert.equal(result.growth, 100);
    assert.equal(result.baselineFollowers, 200);
    assert.equal(result.growthPercent, 50);
  });

  test('handles negative growth (follower loss)', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 500 },
      { date: new Date('2026-01-10T00:00:00Z'), followers: 400 },
    ];
    const result = calculateRangeGrowth(history, 400);
    assert.equal(result.growth, -100);
    assert.equal(result.growthPercent, -20);
  });

  test('handles zero baseline (avoids division by zero)', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 0 },
      { date: new Date('2026-01-10T00:00:00Z'), followers: 100 },
    ];
    const result = calculateRangeGrowth(history, 100);
    assert.equal(result.growth, 100);
    assert.equal(result.growthPercent, 0); // 0 baseline => 0%
  });

  test('single data point uses it as baseline', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00Z'), followers: 300 },
    ];
    const result = calculateRangeGrowth(history, 350);
    assert.equal(result.growth, 50);
    assert.equal(result.baselineFollowers, 300);
  });
});

describe('buildGrowthTrendData', () => {
  test('returns empty array for no records', () => {
    const result = buildGrowthTrendData([]);
    assert.equal(result.length, 0);
  });

  test('aggregates multiple handles on same day', () => {
    const records: CreatorRecord[] = [
      {
        timestamp: new Date('2026-02-05T10:00:00Z'),
        tiktok: {
          handle: 'alpha',
          followers: 1000,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T12:00:00Z'),
        tiktok: {
          handle: 'beta',
          followers: 2000,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
    ];
    const result = buildGrowthTrendData(records);
    assert.equal(result.length, 1);
    assert.equal(result[0].tiktok, 3000);
    assert.equal(result[0].total, 3000);
  });

  test('keeps latest snapshot per handle per day', () => {
    const records: CreatorRecord[] = [
      {
        timestamp: new Date('2026-02-05T08:00:00Z'),
        tiktok: {
          handle: 'alpha',
          followers: 1000,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T20:00:00Z'),
        tiktok: {
          handle: 'alpha',
          followers: 1100,
          deltaFollowers: 100,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
    ];
    const result = buildGrowthTrendData(records);
    assert.equal(result.length, 1);
    assert.equal(result[0].tiktok, 1100); // latest snapshot wins
  });

  test('produces sorted output across multiple days', () => {
    const records: CreatorRecord[] = [
      {
        timestamp: new Date('2026-02-07T10:00:00Z'),
        tiktok: {
          handle: 'a',
          followers: 300,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T10:00:00Z'),
        tiktok: {
          handle: 'a',
          followers: 100,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-06T10:00:00Z'),
        tiktok: {
          handle: 'a',
          followers: 200,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
    ];
    const result = buildGrowthTrendData(records);
    assert.equal(result.length, 3);
    assert.ok(result[0].date < result[1].date);
    assert.ok(result[1].date < result[2].date);
  });

  test('sums across all three platforms', () => {
    const records: CreatorRecord[] = [
      {
        timestamp: new Date('2026-02-05T12:00:00Z'),
        tiktok: {
          handle: 'a',
          followers: 1000,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: {
          handle: 'a_ig',
          followers: 500,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        twitter: {
          handle: 'a_x',
          followers: 200,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
      },
    ];
    const result = buildGrowthTrendData(records);
    assert.equal(result.length, 1);
    assert.equal(result[0].tiktok, 1000);
    assert.equal(result[0].instagram, 500);
    assert.equal(result[0].twitter, 200);
    assert.equal(result[0].total, 1700);
  });
});
