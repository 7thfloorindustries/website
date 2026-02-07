import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildGrowthTrendData, calculateDeltas, calculateRangeGrowth } from '../src/hooks/dashboard/useGrowthCalculations';
import type { CreatorRecord } from '../src/lib/dashboard/types';

describe('Brokedown growth calculations', () => {
  test('calculateRangeGrowth uses earliest point in selected range', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00.000Z'), followers: 100 },
      { date: new Date('2026-01-05T00:00:00.000Z'), followers: 120 },
      { date: new Date('2026-01-10T00:00:00.000Z'), followers: 150 },
    ];

    const result = calculateRangeGrowth(history, 150);
    assert.equal(result.growth, 50);
    assert.equal(result.baselineFollowers, 100);
    assert.equal(result.growthPercent, 50);
  });

  test('calculateRangeGrowth handles empty history safely', () => {
    const result = calculateRangeGrowth([], 325);
    assert.equal(result.growth, 0);
    assert.equal(result.baselineFollowers, 325);
    assert.equal(result.growthPercent, 0);
  });

  test('calculateDeltas computes 1D and 7D deltas from historical points', () => {
    const history = [
      { date: new Date('2026-01-01T00:00:00.000Z'), followers: 90 },
      { date: new Date('2026-01-07T00:00:00.000Z'), followers: 140 },
      { date: new Date('2026-01-10T12:00:00.000Z'), followers: 165 },
    ];

    const result = calculateDeltas(history, 165);
    assert.equal(result.delta1d, 25);
    assert.equal(result.delta7d, 75);
  });

  test('calculateDeltas uses true 24h and 7d thresholds', () => {
    const history = [
      { date: new Date('2026-02-01T12:00:00.000Z'), followers: 100 },   // 9d before latest
      { date: new Date('2026-02-04T12:00:00.000Z'), followers: 130 },   // 6d before latest (must NOT be used for 7d)
      { date: new Date('2026-02-10T04:00:00.000Z'), followers: 190 },   // 32h before latest (used for 24h)
      { date: new Date('2026-02-11T04:00:00.000Z'), followers: 210 },   // 8h before latest (must NOT be used for 24h)
      { date: new Date('2026-02-11T12:00:00.000Z'), followers: 220 },   // latest
    ];

    const result = calculateDeltas(history, 220);
    assert.equal(result.delta1d, 30);
    assert.equal(result.delta7d, 120);
  });

  test('buildGrowthTrendData uses the latest daily snapshot per handle/platform', () => {
    const records: CreatorRecord[] = [
      {
        timestamp: new Date('2026-02-05T09:00:00.000Z'),
        tiktok: {
          handle: 'alpha',
          followers: 81000,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T17:00:00.000Z'),
        tiktok: {
          handle: 'alpha',
          followers: 81400,
          deltaFollowers: 400,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        instagram: null,
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T12:00:00.000Z'),
        tiktok: null,
        instagram: {
          handle: 'alpha_ig',
          followers: 93,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
        twitter: null,
      },
      {
        timestamp: new Date('2026-02-05T12:00:00.000Z'),
        tiktok: null,
        instagram: null,
        twitter: {
          handle: 'alpha_x',
          followers: 83,
          deltaFollowers: 0,
          posts: 0,
          deltaPosts: 0,
          postsLast7d: 0,
        },
      },
    ];

    const trend = buildGrowthTrendData(records);
    assert.equal(trend.length, 1);
    assert.equal(trend[0].tiktok, 81400);
    assert.equal(trend[0].instagram, 93);
    assert.equal(trend[0].twitter, 83);
    assert.equal(trend[0].total, 81576);
  });
});
