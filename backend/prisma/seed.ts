import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL;
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!username || !password || password.length < 12) throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters).');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const count = await prisma.adminUser.count();
if (count > 0) throw new Error('Admin already exists. Refusing to create a second account.');
await prisma.adminUser.create({ data: { username: username.toLowerCase(), passwordHash: await bcrypt.hash(password, 12) } });
console.log(`Admin ${username} created.`);
await prisma.$disconnect();