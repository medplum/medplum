#!/usr/bin/env bash

# Login to AWS ECR
aws ecr get-login-password --profile medplum --region us-east-1 | docker login --username AWS --password-stdin 647991932601.dkr.ecr.us-east-1.amazonaws.com

# Build the Docker image
docker build . 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:latest -t 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:0.0.19

# Push the Docker image
docker push 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:0.0.19
docker push 647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:latest

# Update the medplum fargate service
aws ecs update-service \
  --profile medplum \
  --region us-east-1 \
  --cluster MedplumStack-BackEndCluster6B6DC4A8-b7rLxsX1zQdL \
  --service MedplumStack-BackEndFargateServiceD3B260C0-S35OIZcOSp1P \
  --force-new-deployment
