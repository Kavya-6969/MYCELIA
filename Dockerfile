FROM node:22-slim

WORKDIR /app

# Ensure curl / sqlite utilities if needed, keep image slim
ENV NODE_ENV=production
ENV PORT=3000
ENV RG_DB_FILE=/data/researchgraph.db

# Copy package and core files
COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Directory for persistent SQLite storage
RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
