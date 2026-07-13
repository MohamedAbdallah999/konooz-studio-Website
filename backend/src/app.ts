import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { auth, errorHandler, notFound } from './middleware.js';
import authRoutes from './auth.js';
import itemRoutes from './items.js';
import saleRoutes from './sales.js';
import syncRoutes from './sync.js';
import { prisma, prismaContext } from './db.js';
export const app = express();
app.set('trust proxy', 1);
app.use(prismaContext);
app.use((req, res, next) => {
  if (config.NODE_ENV === 'production' && !req.secure) {
    res.status(400).json({ error: 'HTTPS required' });
    return;
  }
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", config.FRONTEND_ORIGIN],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  }),
);
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
app.use(cookieParser());
app.get('/health', async (_q, r, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    r.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(Object.assign(error as object, { status: 503 }));
  }
});
app.use('/api/auth', express.json({ limit: '32kb' }), authRoutes);
app.use('/api/items', auth, express.json({ limit: '10mb' }), itemRoutes);
app.use('/api/sales', auth, express.json({ limit: '2mb' }), saleRoutes);
app.use('/api/sync', auth, express.json({ limit: '10mb' }), syncRoutes);
app.use(notFound);
app.use(errorHandler);
