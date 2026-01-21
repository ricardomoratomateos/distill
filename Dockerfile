# Production Dockerfile for distill
FROM node:20-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./

# Copy package.json files for all packages
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/
COPY examples/package.json ./examples/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY examples/ ./examples/

# Build all packages
RUN pnpm build

# Production image
FROM node:20-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy built application
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/examples ./examples
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-workspace.yaml ./

# Create data directory
RUN mkdir -p /app/data && chmod 777 /app/data

# Set CLI as entrypoint
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
