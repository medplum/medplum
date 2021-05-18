#!/usr/bin/env bash

MAJOR_VERSION=0
MINOR_VERSION=0

# Parse command line arguments
BUILD_NUMBER=$1

# Verify that we have both release version and next snapshot version
# If not, print usage and exit
if [ -z "${BUILD_NUMBER}" ]; then
  echo "Usage: release.sh BUILD_NUMBER" 1>&2
  echo "Example: release.sh 42" 1>&2
  exit 1
fi

# Build version numbers
RELEASE_VERSION="${MAJOR_VERSION}.${MINOR_VERSION}.${BUILD_NUMBER}"
NEXT_SNAPSHOT_VERSION="${MAJOR_VERSION}.${MINOR_VERSION}.$((BUILD_NUMBER + 1))-SNAPSHOT"

echo "RELEASE=${RELEASE_VERSION}"
echo "SNAPSHOT=${NEXT_SNAPSHOT_VERSION}"

# Fail on error
set -e

# Echo commands
set -x

# Set release version
# mvn versions:set -DnewVersion=${RELEASE_VERSION} -DgenerateBackupPoms=false
# cd medplum-ts && npm version ${RELEASE_VERSION} && cd ..
# cd medplum-ui && npm version ${RELEASE_VERSION} && cd ..
# cd medplum-console && npm version ${RELEASE_VERSION} && cd ..
# cd medplum-graphiql && npm version ${RELEASE_VERSION} && cd ..

# Clean install
# mvn clean install
# npm run build --workspace=medplum-ts --workspace=medplum-ui --workspace=medplum-console --workspace=medplum-graphiql
# npm run storybook --workspace=medplum-ui

# At this point, all projects built successfully

# Deploy libraries to Maven Central
# mvn -pl -medplum-cdk,-medplum-coverage,-medplum-generator,-medplum-server clean deploy -P release -e

# Build site
# mvn site:site site:stage

# Deploy site
aws s3 cp target/staging/ s3://docs.medplum.com/maven/${RELEASE_VERSION}/ --profile medplum --region us-east-1 --recursive --acl public-read

# Deploy medplum-ts to npm
#cd medplum-ts && npm publish && cd ..

# Deploy medplum-ui to npm
#cd medplum-ui && npm publish && cd ..

# Deploy storybook to S3
# cd medplum-ui
# aws s3 cp storybook-static/ s3://medplum-storybook/ --profile medplum --region us-east-1 --recursive --acl public-read
# cd ..

# Deploy console to S3
# cd medplum-console
# aws s3 cp dist/ s3://medplum-console/ --profile medplum --region us-east-1 --recursive
# cd ..

# Deploy graphiql to S3
# cd medplum-graphiql
# aws s3 cp dist/ s3://medplum-graphiql/ --profile medplum --region us-east-1 --recursive
# cd ..

# Build docker image
pushd medplum-server
mvn -B -P docker -DskipTests=true clean package
docker tag medplum-server:${RELEASE_VERSION} 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:${RELEASE_VERSION}
docker tag medplum-server:${RELEASE_VERSION} 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:latest
docker push 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:${RELEASE_VERSION}
docker push 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:latest
popd

# Update the medplum fargate service
aws ecs update-service \
  --profile medplum \
  --region us-east-1 \
  --cluster MedplumStack-BackEndCluster6B6DC4A8-eFbKEVFrgmMR \
  --service MedplumStack-BackEndFargateServiceD3B260C0-BAnXfRE5eGRD \
  --force-new-deployment

# Commit release
git commit -am "Version ${RELEASE_VERSION}"

# Tag release
git tag medplum-${RELEASE_VERSION}

# Set next snapshot release
mvn versions:set -DnewVersion=${NEXT_SNAPSHOT_VERSION} -DgenerateBackupPoms=false

# Commit snapshot:
git commit -am "Version ${NEXT_SNAPSHOT_VERSION}"

# Push to GitHub:
git push
