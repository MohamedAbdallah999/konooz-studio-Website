import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { auth, errorHandler, notFound, requestContext } from './middleware.js';
import authRoutes from './auth.js';
import modelRoutes from './models.js';
import saleRoutes from './sales.js';
import stateRoutes from './state.js';
import { prisma, prismaContext } from './db.js';
export const app = express();
const allowedOrigin = (origin: string | undefined) => !origin || origin === config.FRONTEND_ORIGIN;

app.set('trust proxy', 1);
app.use(prismaContext);
app.use(requestContext);
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
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => callback(null, allowedOrigin(origin)),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type'],
  maxAge: 600,
}));
app.use(cookieParser());
app.get('/health', async (_q, r, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    r.json({ status: 'ok' });
  } catch (error) {
    next(Object.assign(error as object, { status: 503 }));
  }
});
app.use('/api/auth', express.json({ limit: '32kb' }), authRoutes);
app.use('/api/models', auth, express.json({ limit: '2mb' }), modelRoutes);
app.use('/api/sales', auth, express.json({ limit: '2mb' }), saleRoutes);
app.use('/api/state', auth, stateRoutes);
app.use(notFound);
app.use(errorHandler);
