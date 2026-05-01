# Hiive Build Medplum Deployment

Last updated: 2026-05-01

## Deployment Summary

This repository now contains a working Medplum self-hosted deployment for the Hiive build environment.

| Item | Value |
| --- | --- |
| AWS account ID | `476905305808` |
| AWS SSO profile | `hiive-build` |
| AWS region | `us-east-1` |
| Environment tag | `build` |
| CloudFormation stack | `MedplumBuild` |
| Stack status | `CREATE_COMPLETE` |
| Stack ID | `arn:aws:cloudformation:us-east-1:476905305808:stack/MedplumBuild/1223e290-4583-11f1-a2fc-0e2c39e9b6b9` |
| Stack creation time | `2026-05-01T17:27:47.659Z` |
| Route 53 hosted zone | `ehr.hiivehealth.net.` |
| Hosted zone ID | `Z10230423D7NKJNVQRX7O` |
| Hosted zone type | Public |
| Support email | `techservices+medplum@hiivehealth.com` |

Use this profile when operating the deployment:

```bash
AWS_PROFILE=hiive-build
AWS_SDK_LOAD_CONFIG=1
```

## Config Files

The deployment is driven by:

- `medplum.build.config.json`
- `cdk.json`

Important config values from `medplum.build.config.json`:

- Region: `us-east-1`
- Domain: `ehr.hiivehealth.net`
- API domain: `api.ehr.hiivehealth.net`
- App domain: `app.ehr.hiivehealth.net`
- Storage domain: `storage.ehr.hiivehealth.net`
- Storage bucket: `storage.ehr.hiivehealth.net`
- Server image: `medplum/medplum-server:5.1.10`
- ECS desired server count: `1`
- ECS task size: `256` CPU / `512` MB memory
- RDS instances: `1`
- Redis node type: `cache.t3.small`

## What Was Installed

The `MedplumBuild` stack installed the following major components:

- VPC across 2 availability zones
- ECS cluster and Fargate service for the Medplum backend
- Application Load Balancer for the backend API
- Aurora PostgreSQL database
- ElastiCache Redis replication group
- S3 bucket for the Medplum app static site
- S3 bucket for Medplum binary storage
- CloudFront distribution for the app site
- CloudFront distribution for storage delivery
- AWS WAF protections for backend, app, and storage entry points
- ACM certificates for `api`, `app`, and `storage` subdomains
- Route 53 DNS records for the deployed public endpoints
- SSM Parameter Store values under `/medplum/build/`
- Bot Lambda role plumbing for Medplum bot execution

Note: the frontend app bundle was uploaded after infrastructure deployment using the Medplum CLI `aws update-app` command.

## Key AWS Resource Identifiers

| Resource | Value |
| --- | --- |
| ECS cluster | `MedplumBuild-BackEndCluster6B6DC4A8-RJc8IRf3ENQc` |
| ECS service | `MedplumBuild-BackEndFargateServiceD3B260C0-VHHbzrR6nDGn` |
| App bucket | `app.ehr.hiivehealth.net` |
| App CloudFront distribution | `E1X2GGZQNIRZH0` |
| App Origin Access Identity | `E2YDE7AXMSJCTW` |
| Storage bucket | `storage.ehr.hiivehealth.net` |
| Storage CloudFront distribution | `E3KK2L3RMNGLCW` |
| Storage Origin Access Identity | `E14HTMCLL2CSFS` |
| API ACM certificate | `arn:aws:acm:us-east-1:476905305808:certificate/40a36aac-d4bb-4318-ae79-244965b224df` |
| App ACM certificate | `arn:aws:acm:us-east-1:476905305808:certificate/f9dbc656-75a0-43c4-9fbd-2d3f7aeb5e7b` |
| Storage ACM certificate | `arn:aws:acm:us-east-1:476905305808:certificate/e7a868ea-d885-41c3-8fa6-3c6e2cfd354c` |
| CloudFront signing key ID | `K1Y1YQ5ZH4N0OG` |

## Public URLs And Endpoints

### Primary URLs

- App: `https://app.ehr.hiivehealth.net/`
- API base: `https://api.ehr.hiivehealth.net/`
- Storage base: `https://storage.ehr.hiivehealth.net/binary/`

### API Endpoints

- Health check: `https://api.ehr.hiivehealth.net/healthcheck`
- FHIR R4 base: `https://api.ehr.hiivehealth.net/fhir/R4/`
- OIDC issuer: `https://api.ehr.hiivehealth.net/`
- OAuth authorize endpoint: `https://api.ehr.hiivehealth.net/oauth2/authorize`
- OAuth token endpoint: `https://api.ehr.hiivehealth.net/oauth2/token`
- OAuth userinfo endpoint: `https://api.ehr.hiivehealth.net/oauth2/userinfo`
- OAuth introspection endpoint: `https://api.ehr.hiivehealth.net/oauth2/introspect`
- OAuth dynamic registration endpoint: `https://api.ehr.hiivehealth.net/oauth2/register`
- JWKS endpoint: `https://api.ehr.hiivehealth.net/.well-known/jwks.json`
- OIDC metadata: `https://api.ehr.hiivehealth.net/.well-known/openid-configuration`

### Storage Notes

- The storage domain is fronted by CloudFront and a private S3 origin.
- A bare request to `https://storage.ehr.hiivehealth.net/` is expected to return an access error.
- The intended public storage base for Medplum binary URLs is `https://storage.ehr.hiivehealth.net/binary/`.

## Bootstrap Access

On first boot, Medplum seeds a default super-admin account unless overridden in server config.

| Item | Value |
| --- | --- |
| Initial email | `admin@example.com` |
| Initial password | `medplum_admin` |
| Super admin project | `Super Admin` |

Change this password immediately after first login.

## SSM Parameter Store

Deployment parameters are stored under `/medplum/build/`.

Current keys:

- `/medplum/build/DatabaseSecrets`
- `/medplum/build/RedisSecrets`
- `/medplum/build/appBaseUrl`
- `/medplum/build/awsRegion`
- `/medplum/build/baseUrl`
- `/medplum/build/binaryStorage`
- `/medplum/build/botLambdaRoleArn`
- `/medplum/build/port`
- `/medplum/build/signingKey`
- `/medplum/build/signingKeyId`
- `/medplum/build/signingKeyPassphrase`
- `/medplum/build/storageBaseUrl`
- `/medplum/build/supportEmail`

## Operational Notes

- Route 53 for `ehr.hiivehealth.net` is public and hosted in the same AWS account.
- SES is still in sandbox mode for this account.
- Current SES status: `ProductionAccessEnabled=false`.
- Current SES quota: `200` emails per 24 hours, `1` email per second.
- In sandbox mode, email delivery is limited to verified identities and recipients.
- Public self-registration is not currently enabled in the deployed app config.
- A config override was required for Redis: `cacheNodeType` is set to `cache.t3.small` because the Medplum CDK default `cache.t2.medium` failed during deployment.
- `medplum aws describe build` is the quickest way to re-check the main resource IDs for this stack.

## Useful Commands

```bash
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 npx cdk synth -c config=medplum.build.config.json
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 npx cdk deploy -c config=medplum.build.config.json --require-approval never
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 node packages/cli/dist/cjs/index.cjs aws describe build
AWS_PROFILE=hiive-build AWS_SDK_LOAD_CONFIG=1 node packages/cli/dist/cjs/index.cjs aws update-app build
```