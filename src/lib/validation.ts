import { z } from 'zod';

/**
 * Contact form validation schema
 */
export const contactFormSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .email('Invalid email format')
    .transform((val) => val.toLowerCase().trim()),
  message: z
    .string()
    .max(5000, 'Message is too long')
    .optional()
    .transform((val) => val?.trim() ?? ''),
  // Honeypot field - must be empty
  website: z
    .string()
    .max(0, 'Invalid submission')
    .optional()
    .default(''),
});

/**
 * Creator signup form validation schema
 */
export const creatorSignupSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .email('Invalid email format')
    .transform((val) => val.toLowerCase().trim()),
  handle: z
    .string()
    .min(1, 'TikTok handle is required')
    .max(30, 'Handle is too long')
    .regex(/^@?[a-zA-Z0-9_.]+$/, 'Invalid TikTok handle format')
    .transform((val) => val.trim()),
  // Honeypot field - must be empty
  company: z
    .string()
    .max(0, 'Invalid submission')
    .optional()
    .default(''),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type CreatorSignupData = z.infer<typeof creatorSignupSchema>;
