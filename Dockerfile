FROM node:24-bookworm-slim AS web
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens packages/design-tokens
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm build

FROM rust:1-trixie AS server
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake nasm pkg-config libdav1d-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps/server apps/server
RUN cargo build --release -p lubanpng

FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libdav1d7 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server /src/target/release/lubanpng /app/lubanpng
COPY --from=web /src/apps/web/dist /app/web
ENV APP_WEB__STATIC_DIR=/app/web
USER 65534:65534
EXPOSE 3000
ENTRYPOINT ["/app/lubanpng"]
