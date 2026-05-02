FROM node:lts AS base
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 300000
COPY . .

FROM base AS linter
# RUN yarn lint

FROM linter AS builder
RUN yarn build

FROM node:lts-alpine AS prod
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile --network-timeout 300000

EXPOSE 3000

CMD ["yarn", "start:prod"]
