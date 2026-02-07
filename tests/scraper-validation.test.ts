import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  TikTokResponseSchema,
  InstagramResponseSchema,
  TwitterResponseSchema,
} from '../src/lib/schemas/scraper';

// -- Fixtures --

const validTikTokResponse = [
  {
    authorMeta: { fans: 50000, heart: 1200000, video: 120 },
    fans: 50000,
    heart: 1200000,
    video: 120,
  },
];

const validInstagramResponse = [
  { followersCount: 12000, postsCount: 85 },
];

const validTwitterResponse = {
  result: {
    data: {
      user: {
        result: {
          legacy: {
            followers_count: 8000,
            statuses_count: 2500,
          },
        },
      },
    },
  },
};

// -- TikTok Schema Tests --

describe('TikTokResponseSchema', () => {
  test('accepts valid TikTok response', () => {
    const result = TikTokResponseSchema.safeParse(validTikTokResponse);
    assert.equal(result.success, true);
  });

  test('accepts response with only authorMeta fields', () => {
    const response = [{ authorMeta: { fans: 100 } }];
    const result = TikTokResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('accepts response with zero followers', () => {
    const response = [{ fans: 0, heart: 0, video: 0 }];
    const result = TikTokResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('accepts response with extra fields (zod strips unknown by default)', () => {
    const response = [{ fans: 100, heart: 200, video: 10, unknownField: 'extra' }];
    const result = TikTokResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('rejects empty array', () => {
    const result = TikTokResponseSchema.safeParse([]);
    assert.equal(result.success, false);
  });

  test('rejects non-array', () => {
    const result = TikTokResponseSchema.safeParse({ fans: 100 });
    assert.equal(result.success, false);
  });

  test('rejects string values for numeric fields', () => {
    const response = [{ fans: 'not a number' }];
    const result = TikTokResponseSchema.safeParse(response);
    assert.equal(result.success, false);
  });

  test('accepts response with all optional fields missing', () => {
    const response = [{}];
    const result = TikTokResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('rejects null', () => {
    const result = TikTokResponseSchema.safeParse(null);
    assert.equal(result.success, false);
  });
});

// -- Instagram Schema Tests --

describe('InstagramResponseSchema', () => {
  test('accepts valid Instagram response', () => {
    const result = InstagramResponseSchema.safeParse(validInstagramResponse);
    assert.equal(result.success, true);
  });

  test('accepts response with zero followers', () => {
    const response = [{ followersCount: 0, postsCount: 0 }];
    const result = InstagramResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('accepts response with only followersCount', () => {
    const response = [{ followersCount: 500 }];
    const result = InstagramResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('accepts response with extra fields', () => {
    const response = [{ followersCount: 100, postsCount: 50, biography: 'test' }];
    const result = InstagramResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('rejects empty array', () => {
    const result = InstagramResponseSchema.safeParse([]);
    assert.equal(result.success, false);
  });

  test('rejects non-array', () => {
    const result = InstagramResponseSchema.safeParse({ followersCount: 100 });
    assert.equal(result.success, false);
  });

  test('rejects string values for followersCount', () => {
    const response = [{ followersCount: 'abc' }];
    const result = InstagramResponseSchema.safeParse(response);
    assert.equal(result.success, false);
  });

  test('accepts all optional fields missing', () => {
    const response = [{}];
    const result = InstagramResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });
});

// -- Twitter Schema Tests --

describe('TwitterResponseSchema', () => {
  test('accepts valid Twitter response', () => {
    const result = TwitterResponseSchema.safeParse(validTwitterResponse);
    assert.equal(result.success, true);
  });

  test('accepts response with zero followers', () => {
    const response = {
      result: {
        data: {
          user: {
            result: {
              legacy: { followers_count: 0, statuses_count: 0 },
            },
          },
        },
      },
    };
    const result = TwitterResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('accepts response with optional legacy fields missing', () => {
    const response = {
      result: {
        data: {
          user: {
            result: {
              legacy: {},
            },
          },
        },
      },
    };
    const result = TwitterResponseSchema.safeParse(response);
    assert.equal(result.success, true);
  });

  test('rejects response missing nested structure', () => {
    const result = TwitterResponseSchema.safeParse({ result: {} });
    assert.equal(result.success, false);
  });

  test('rejects response missing result key', () => {
    const result = TwitterResponseSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test('rejects array input', () => {
    const result = TwitterResponseSchema.safeParse([validTwitterResponse]);
    assert.equal(result.success, false);
  });

  test('rejects string values for followers_count', () => {
    const response = {
      result: {
        data: {
          user: {
            result: {
              legacy: { followers_count: 'many' },
            },
          },
        },
      },
    };
    const result = TwitterResponseSchema.safeParse(response);
    assert.equal(result.success, false);
  });

  test('rejects null', () => {
    const result = TwitterResponseSchema.safeParse(null);
    assert.equal(result.success, false);
  });
});
