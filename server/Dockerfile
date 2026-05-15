FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root package files
COPY package.json package-lock.json ./

# Copy all pdfme packages (server depends on them via file: references)
COPY packages/common ./packages/common
COPY packages/generator ./packages/generator
COPY packages/schemas ./packages/schemas
COPY packages/pdf-lib ./packages/pdf-lib
COPY packages/converter ./packages/converter

# Copy server source
COPY server ./server

# Install deps — run from server dir since it's not in root workspaces
WORKDIR /app/server
RUN npm install

# Build server TypeScript
RUN npm run build

# --- Runtime image ---
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/packages ./packages
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json

WORKDIR /app/server

EXPOSE 3004

CMD ["node", "dist/index.js"]
