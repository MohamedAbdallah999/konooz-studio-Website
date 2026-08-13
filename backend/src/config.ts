import 'dotenv/config';
import { z } from 'zod';
import type { Algorithm } from 'jsonwebtoken';

const origin = z.string().url().transform(value => {
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password) {
    throw new Error('FRONTEND_ORIGIN must be an exact origin without a path, credentials, or trailing slash.');
  }
  return url.origin;
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: origin,
}).superRefine((value, context) => {
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'JWT secrets must be different.' });
  }
});

export const config = schema.parse(process.env);
export const jwtIdentity = { audience: 'konooz-web', issuer: 'konooz-api' };
export const jwtVerifyConfig = { ...jwtIdentity, algorithms: ['HS256'] as Algorithm[] };
