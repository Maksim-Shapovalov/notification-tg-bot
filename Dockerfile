# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
  && npm install -g yarn@1.22.22

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN yarn build

FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat \
  && npm install -g yarn@1.22.22

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

CMD ["node", "dist/main.js"]
