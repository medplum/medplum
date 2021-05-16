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

# Configure git
git config --global user.name 'Medplum'
git config --global user.email 'medplum@users.noreply.github.com'

# Build list of files changed in last commit
git diff --name-only HEAD HEAD~1

# Set release version
mvn versions:set -DnewVersion=${RELEASE_VERSION} -DgenerateBackupPoms=false

# Clean install
mvn clean install

# Deploy libraries to Maven Central
#mvn -pl -medplum-cdk,-medplum-coverage,-medplum-generator,-medplum-server clean deploy -P release -e

# Build site
#mvn -pl -medplum-cdk,-medplum-coverage,-medplum-generator site:site site:stage

# Deploy site
#aws s3 cp target/staging/ s3://docs.medplum.com/maven/${RELEASE_VERSION}/ --region us-east-1 --recursive --acl public-read

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
