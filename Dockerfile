# Farmiqo production image: single-origin Express API + Vite-built web client.
# Hosts: Railway (primary, see railway.json), or any Docker-capable Node host.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Railway injects PORT at runtime; the server binds 0.0.0.0 and serves
# both /api/* and the static dist/ client from this single origin.
EXPOSE 3000
CMD ["npm", "run", "api"]
