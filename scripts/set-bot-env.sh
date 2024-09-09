#!/usr/bin/env bash

# This script expects 2 command line arguments:
# 1. The Bot ID
# 2. The Bot environment variables in AWS Lambda JSON format

# AWS Lambda JSON format
# See: https://docs.aws.amazon.com/cli/latest/reference/lambda/update-function-configuration.html
#
# Example JSON file:
# {
#   "Variables": {
#     "HEALTH_GORILLA_BASE_URL": "https://sandbox.healthgorilla.com",
#     "HEALTH_GORILLA_AUDIENCE_URL": "https://sandbox.healthgorilla.com/oauth/token",
#     "HEALTH_GORILLA_CLIENT_ID": "MY_CLIENT_ID",
#     "HEALTH_GORILLA_CLIENT_SECRET": "MY_CLIENT_SECRET",
#     "HEALTH_GORILLA_CLIENT_URI": "https://www.medplum.com",
#     "HEALTH_GORILLA_USER_LOGIN": "medplum.api",
#     "HEALTH_GORILLA_SCOPES": "user/*.*",
#     "HEALTH_GORILLA_PROVIDER_LAB_ACCOUNT": "MY_PROVIDER_LAB_ACCOUNT",
#     "HEALTH_GORILLA_TENANT_ID": "MY_TENANT_ID",
#     "HEALTH_GORILLA_SUBTENANT_ID": "MY_SUBTENANT_ID",
#     "HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER": "MY_SUBTENANT_ACCOUNT_NUMBER",
#     "HEALTH_GORILLA_CALLBACK_BOT_ID": "MY_CALLBACK_BOT_ID",
#     "HEALTH_GORILLA_CALLBACK_CLIENT_ID": "MY_CALLBACK_CLIENT_ID",
#     "HEALTH_GORILLA_CALLBACK_CLIENT_SECRET": "MY_CALLBACK_CLIENT_SECRET",
#   }
# }

BOT_ID=$1
ENV_VARS_FILE=$2

if [[ -z "${BOT_ID}" ]]; then
  echo "BOT_ID is missing"
  echo "Usage: ./set-bot-env.sh <BOT_ID> <ENV_VARS_FILE>"
  exit 1
fi

if [[ -z "${ENV_VARS_FILE}" ]]; then
  echo "ENV_VARS_FILE is missing"
  echo "Usage: ./set-bot-env.sh <BOT_ID> <ENV_VARS_FILE>"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Update the bot environment variables
aws lambda update-function-configuration --function-name "medplum-bot-lambda-${BOT_ID}" --environment "file://${ENV_VARS_FILE}"
