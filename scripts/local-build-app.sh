IMAGE_REPO=917713072512.dkr.ecr.us-east-1.amazonaws.com/dev-medplum-app
VERSION=$(node -p "require('./package.json').version")
#VERSION=latest
echo Building vesion: $VERSION

pushd packages/app

# ECR Login
aws sso login --sso-session dev
aws ecr get-login-password --region us-east-1 --profile AWS-DevOps-917713072512 | docker login --username AWS --password-stdin 917713072512.dkr.ecr.us-east-1.amazonaws.com

#aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 917713072512.dkr.ecr.us-east-1.amazonaws.com

# Image build and push
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --tag "$IMAGE_REPO:$VERSION" \
  --push \
.

popd
