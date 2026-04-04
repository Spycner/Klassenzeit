FROM rust:1.93-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY backend/ backend/
COPY scheduler/ scheduler/

RUN cargo build --release -p klassenzeit-backend

FROM alpine:3.21 AS runner

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/target/release/klassenzeit_backend-cli /usr/local/bin/klassenzeit_backend-cli
COPY backend/config/ /app/config/

WORKDIR /app
ENV LOCO_ENV=production

EXPOSE 3001

CMD ["klassenzeit_backend-cli", "start"]
