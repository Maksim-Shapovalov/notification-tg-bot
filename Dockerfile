FROM node:lts-alpine AS builder
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout=100000
COPY . .
RUN yarn build && test -f dist/main.js

FROM node:lts-alpine AS prod-deps
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile --network-timeout=100000 && yarn cache clean

FROM node:lts-alpine AS prod
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app
USER node
CMD ["node", "dist/main.js"]
