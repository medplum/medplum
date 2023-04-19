
IMAGE_REPO=917713072512.dkr.ecr.us-east-1.amazonaws.com/dev-devs-medplum-server
VERSION=$(node -p "require('./package.json').version")

# Build server tarball
tar \
  --exclude='*.js.map' \
  --exclude='*.cjs.map' \
  --exclude='*.mjs.map' \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server.tar.gz \
  package.json \
  package-lock.json \
  packages/core/package.json \
  packages/core/dist \
  packages/definitions/package.json \
  packages/definitions/dist \
  packages/fhir-router/package.json \
  packages/fhir-router/dist \
  packages/server/package.json \
  packages/server/dist

# ECR Login
aws ecr get-login-password --region us-east-1 --profile dev | docker login --username AWS --password-stdin 917713072512.dkr.ecr.us-east-1.amazonaws.com

# Image build and push
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --tag "$IMAGE_REPO:latest" \
  --tag "$IMAGE_REPO:$VERSION" \
  --push \
.
