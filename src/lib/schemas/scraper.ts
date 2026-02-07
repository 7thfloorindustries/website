import { z } from 'zod';

/**
 * Zod schemas for validating external scraper API responses.
 * These protect against malformed data reaching the database.
 */

// -- TikTok (Apify Clockworks actor) --

const TikTokAuthorMetaSchema = z.object({
  fans: z.number().optional(),
  heart: z.number().optional(),
  video: z.number().optional(),
});

const TikTokProfileSchema = z.object({
  authorMeta: TikTokAuthorMetaSchema.optional(),
  fans: z.number().optional(),
  heart: z.number().optional(),
  video: z.number().optional(),
});

export const TikTokResponseSchema = z.array(TikTokProfileSchema).min(1);

export type TikTokProfile = z.infer<typeof TikTokProfileSchema>;

// -- Instagram (Apify instagram-profile-scraper) --

const InstagramProfileSchema = z.object({
  followersCount: z.number().optional(),
  postsCount: z.number().optional(),
});

export const InstagramResponseSchema = z.array(InstagramProfileSchema).min(1);

export type InstagramProfile = z.infer<typeof InstagramProfileSchema>;

// -- Twitter/X (RapidAPI twitter241) --

const TwitterLegacySchema = z.object({
  followers_count: z.number().optional(),
  statuses_count: z.number().optional(),
});

export const TwitterResponseSchema = z.object({
  result: z.object({
    data: z.object({
      user: z.object({
        result: z.object({
          legacy: TwitterLegacySchema,
        }),
      }),
    }),
  }),
});

export type TwitterLegacy = z.infer<typeof TwitterLegacySchema>;
