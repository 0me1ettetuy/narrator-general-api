# `minio/minio` no longer publishes a public container image. Build the last
# community release from its public, signed source tag instead. This is only
# for the optional local-development storage profile.
FROM golang:1.24-alpine AS build

ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z

RUN apk add --no-cache git

WORKDIR /src

RUN git clone --depth 1 --branch "$MINIO_VERSION" https://github.com/minio/minio.git

WORKDIR /src/minio

RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/minio .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates

COPY --from=build /out/minio /usr/local/bin/minio

EXPOSE 9000 9001

ENTRYPOINT ["/usr/local/bin/minio"]
