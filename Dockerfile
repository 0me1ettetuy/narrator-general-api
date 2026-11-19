FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY src/prisma/contract.prisma ./src/prisma/contract.prisma
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build

FROM dependencies AS development

WORKDIR /app

# The worker invokes ffmpeg and fastText while source watchers run inside
# development containers too.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates fasttext ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY . .

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# The worker invokes ffmpeg to merge temporary chapter MP3 parts and fastText
# to classify imported chapters.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates fasttext ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src/prisma ./src/prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/models ./models

EXPOSE 3000

CMD ["node", "dist/main"]
