import { app } from './app.js';import { config } from './config.js';import { prisma } from './db.js';
const server=app.listen(config.PORT,()=>console.log(`Konooz API listening on ${config.PORT}`));const shutdown=async()=>{server.close();await prisma.$disconnect();process.exit(0)};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
