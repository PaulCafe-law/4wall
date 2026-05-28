FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_APP_ENVIRONMENT=production

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENVIRONMENT=$VITE_APP_ENVIRONMENT

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:stable-alpine

ENV PORT=8080

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
COPY runtime-config.js.template /usr/share/nginx/html/runtime-config.js.template

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 8080
