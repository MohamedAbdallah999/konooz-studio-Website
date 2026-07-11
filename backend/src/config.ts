import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().default(4000),DATABASE_URL:z.string().min(1),JWT_ACCESS_SECRET:z.string().min(32),JWT_REFRESH_SECRET:z.string().min(32),FRONTEND_ORIGIN:z.string().url()});
export const config=schema.parse(process.env);
