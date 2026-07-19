# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and schema first (needed for prepare script)
COPY package*.json ./
COPY src/database/schema.prisma ./src/database/schema.prisma

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S eventnester -u 1001

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R eventnester:nodejs /app

USER eventnester

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/server.js"]
