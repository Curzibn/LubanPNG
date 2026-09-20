FROM oven/bun:1.4.0 AS deps
WORKDIR /app
COPY package.json ./package.json
RUN bun install --production

FROM oven/bun:1.4.0
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY src ./src
ENV NODE_ENV=production
ENV AGENT_GATEWAY_PORT=8080
EXPOSE 8080
USER bun
ENTRYPOINT ["bun", "run", "/app/src/main.ts"]
