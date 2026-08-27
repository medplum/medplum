---
sidebar_position: 21
---

# Building custom Docker images

The published `medplum/medplum-server` and `medplum/medplum-app` images on Docker Hub are enough for most self-hosted setups. If you need your own tags, a private registry, or extra files in the image, build from this repository instead of pulling those Hub images.

The Dockerfiles do not compile TypeScript. They copy tarballs produced after a full `npm run build`. The server image also installs production Node dependencies from the metadata tarball.

## Prerequisites

- Git clone of [medplum/medplum](https://github.com/medplum/medplum)
- Node.js matching the repository version
- Docker with `buildx`

From the repository root:

```bash
git clone https://github.com/medplum/medplum.git
cd medplum
npm ci
npm run build
```

`npm run build` uses Turborepo, so server and app compile in the correct order. The two images can still be built independently after that step.

## Environment variables

| Variable | Required for | Purpose |
| --- | --- | --- |
| `SERVER_DOCKERHUB_REPOSITORY` | Server image | Destination repository, for example `myorg/medplum-server` |
| `APP_DOCKERHUB_REPOSITORY` | App image | Destination repository, for example `myorg/medplum-app`. If unset, `scripts/build-docker-app.sh` skips the app image. |
| `GITHUB_SHA` | Both official scripts | Image tag. Defaults to `git rev-parse HEAD` in `scripts/build-docker-server.sh`. The app script requires it to be set. |

Optional script flags:

- `--latest` also tags `:latest`
- `--release` also tags the `package.json` version and the `major.minor` prefix

## Official build scripts

These are the same scripts GitHub Actions uses to publish images. They create the tarballs, then run `docker buildx build` with `--push`, provenance, SBOM, and `linux/amd64,linux/arm64`.

```bash
export SERVER_DOCKERHUB_REPOSITORY=myorg/medplum-server
export APP_DOCKERHUB_REPOSITORY=myorg/medplum-app
export GITHUB_SHA=$(git rev-parse HEAD)

./scripts/build-docker-server.sh
./scripts/build-docker-app.sh
```

`build-docker-server.sh` writes:

- `medplum-server-metadata.tar.gz` — root and package `package.json` files plus the lockfile
- `medplum-server-runtime.tar.gz` — compiled `dist` folders, `LICENSE.txt`, and `NOTICE`

The root [Dockerfile](https://github.com/medplum/medplum/blob/main/Dockerfile) `ADD`s those archives.

`build-docker-app.sh` writes `packages/app/medplum-app.tar.gz` from `packages/app/dist` and builds [packages/app/Dockerfile](https://github.com/medplum/medplum/blob/main/packages/app/Dockerfile).

After a successful push, `build-docker-server.sh` exports `SERVER_DOCKER_IMAGE` as `repository@sha256:...`. Compose and deploy files can pin that digest instead of a moving tag.

## Build locally without pushing

The official scripts always pass `--push` to `docker buildx`. For a local image, create the same tarballs and call `docker build` yourself.

Server:

```bash
export GITHUB_SHA=$(git rev-parse HEAD)

tar --no-xattrs -czf medplum-server-metadata.tar.gz \
  package.json \
  package-lock.json \
  packages/bot-layer/package.json \
  packages/ccda/package.json \
  packages/core/package.json \
  packages/definitions/package.json \
  packages/fhir-router/package.json \
  packages/server/package.json

tar --no-xattrs \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server-runtime.tar.gz \
  LICENSE.txt \
  NOTICE \
  packages/ccda/dist \
  packages/core/dist \
  packages/definitions/dist \
  packages/fhir-router/dist \
  packages/server/dist

docker build -t myorg/medplum-server:local .
```

App:

```bash
tar --no-xattrs -czf ./packages/app/medplum-app.tar.gz -C packages/app/dist .
docker build -t myorg/medplum-app:local ./packages/app
```

Point `docker-compose` or Kubernetes manifests at those tags instead of `medplum/medplum-server` and `medplum/medplum-app`. Runtime configuration is unchanged; see [Running the Medplum Docker Container](/docs/self-hosting/running-medplum-docker-container) and [Setting configuration](/docs/self-hosting/setting-configuration).

To add files or OS packages, copy the relevant Dockerfile or script and keep the tarball steps. Do not put secrets into the image; keep them in config or a secret store.

## Related

- [Running the Medplum Docker Container](/docs/self-hosting/running-medplum-docker-container)
- [Running the Full Medplum Stack in Docker](/docs/self-hosting/running-full-medplum-stack-in-docker)
- [Install from scratch](/docs/self-hosting/install-from-scratch)
