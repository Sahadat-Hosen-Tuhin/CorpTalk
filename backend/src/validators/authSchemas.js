const { z } = require('zod');

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(128);
const otpCode = z.string().regex(/^\d{6}$/, 'Code must contain exactly 6 digits');
const username = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z.string().regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 letters, numbers, or underscores'),
  );

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email,
    phone: z.string().trim().min(7).max(32).optional(),
    password,
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

const emailSchema = z.object({ email }).strict();
const verifyOtpSchema = z.object({ email, code: otpCode }).strict();

const resetPasswordSchema = z
  .object({
    email,
    code: otpCode,
    password,
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    username: username.optional(),
    bio: z.string().trim().max(500).optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one profile field to update',
  });

module.exports = {
  emailSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema,
};
