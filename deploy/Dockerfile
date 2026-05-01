# ---- Build stage ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

ENV VITE_DEFAULT_API_URL=https://api.openai.com/v1
ENV VITE_API_PROXY_AVAILABLE=false

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=80
ENV DATA_DIR=/data
ENV DEFAULT_API_URL=
ENV API_PROXY_URL=
ENV ENABLE_API_PROXY=false
ENV SERVER_STORAGE=false

COPY --from=build /app/dist ./dist
COPY deploy/server.mjs ./deploy/server.mjs

VOLUME ["/data"]
EXPOSE 80

CMD ["node", "deploy/server.mjs"]
