FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json backend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend backend
RUN npm run build -w backend
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/backend/package*.json backend/
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/src backend/src
COPY --from=build /app/backend/wrangler.jsonc backend/wrangler.jsonc
COPY --from=build /app/backend/worker-configuration.d.ts backend/worker-configuration.d.ts
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate -w backend && node backend/dist/src/server.js"]
