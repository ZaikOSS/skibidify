FROM node:20-alpine

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package.json ./
RUN npm install --omit=dev

# Copy application files
COPY server.js ./
COPY public ./public
COPY music ./music

# Expose web player port
EXPOSE 8888

ENV PORT=8888
ENV IS_DOCKER=true

CMD ["node", "server.js"]
