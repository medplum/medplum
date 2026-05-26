# Hiive Build Medplum Deployment

Last updated: 2026-05-26

## Deployment Summary

This repository now contains a working Medplum self-hosted deployment for the Hiive build environment.

| Item | Value |
| --- | --- |
| AWS account ID | `476905305808` |
| AWS SSO profile | `hiive-build` |
| AWS region | `us-east-1` |
| Environment tag | `build` |
| CloudFormation stack | `MedplumBuild` |
| Stack status | `UPDATE_COMPLETE` |
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
- Patient app domain: `patient.ehr.hiivehealth.net`
- Provider app domain: `provider.ehr.hiivehealth.net`
- Storage domain: `storage.ehr.hiivehealth.net`
- Storage bucket: `storage.ehr.hiivehealth.net`
- Server image: `medplum/medplum-server:5.1.10`
- ECS desired server count: `1`
- ECS task size: `256` CPU / `512` MB memory
- RDS instances: `1`
- Redis node type: `cache.t3.small`

## CDK Stack File Map

The hiive-build CDK stack is defined across a small set of files. The top-level wiring lives in `packages/cdk/src/stack.ts`, and the environment-specific values come from `medplum.build.config.json`.

### Top-Level Wiring

- `packages/cdk/src/stack.ts`
	- Instantiates the backend construct (`BackEnd`).
	- Instantiates the existing Medplum admin frontend construct (`FrontEnd`) for `app.ehr.hiivehealth.net`.
	- Instantiates two additional `StaticApp` constructs when `patientAppDomainName` and `providerAppDomainName` are configured.
	- Instantiates shared storage (`Storage`).

### Backend

- `packages/cdk/src/backend.ts`
	- Defines the backend database layer, including Aurora PostgreSQL and the optional RDS proxy.
	- Defines Redis and any purpose-specific Redis clusters.
	- Defines the ECS Fargate task definition and service for the Medplum server.
	- Defines the backend load balancer, WAF association, API DNS record, and SSM Parameter Store outputs.

### Frontends

- `packages/cdk/src/frontend.ts`
	- Defines the existing Medplum admin frontend for `app.ehr.hiivehealth.net`.
	- Creates the admin app S3 bucket, response headers policy, CloudFront distribution, ACM certificate reference, and Route 53 alias record.

- `packages/cdk/src/staticapp.ts`
	- Defines a reusable static SPA construct used for both `patient.ehr.hiivehealth.net` and `provider.ehr.hiivehealth.net`.
	- Each instance creates a dedicated S3 bucket, certificate or certificate import, response headers policy, CloudFront distribution, WAF, and Route 53 alias record.
	- The patient and provider frontends do not have separate implementation files in the CDK package; they are two instances of this same construct.

### Shared Storage

- `packages/cdk/src/storage.ts`
	- Defines the binary storage S3 bucket, CloudFront public key and key group, response headers and CORS policy, storage distribution, and Route 53 alias record.
	- Adds the patient and provider app origins to storage CORS when those domains are configured.

### Environment Config

- `medplum.build.config.json`
	- Supplies the hiive-build account, region, stack name, domains, certificates, server sizing, and backend environment variables.
	- Controls whether the patient and provider static apps are created by setting `patientAppDomainName` and `providerAppDomainName`.
	- Supplies `MEDPLUM_ALLOWED_ORIGINS`, which is what currently drives the backend task definition replacement in `cdk diff`.

## What Was Installed

The `MedplumBuild` stack installed the following major components:

- VPC across 2 availability zones
- ECS cluster and Fargate service for the Medplum backend
- Application Load Balancer for the backend API
- Aurora PostgreSQL database
- ElastiCache Redis replication group
- S3 bucket for the Medplum app static site
- S3 bucket for the patient app static site
- S3 bucket for the provider app static site
- S3 bucket for Medplum binary storage
- CloudFront distribution for the app site
- CloudFront distributions for the patient and provider sites
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

- Patient app: `https://patient.ehr.hiivehealth.net/`
- Provider app: `https://provider.ehr.hiivehealth.net/`
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

Additional admin login:

| Item | Value |
| --- | --- |
| Initial email | `admin-ubix@example.com` |
| Initial password | `medplum_admin` |
| Super admin project | `Super Admin` |

Patient and provider demo app logins:

These accounts are project-scoped users in the `Ubix Data` Medplum project, not super-admin accounts. They were created without email invites because outbound invite email is not configured yet.

For local development, the patient and provider Vite servers proxy Medplum API paths through their own origins to avoid browser CORS preflight failures. For deployed browser apps, the Medplum server config must include `MEDPLUM_ALLOWED_ORIGINS` for `https://patient.ehr.hiivehealth.net` and `https://provider.ehr.hiivehealth.net`.

The provider access policy also allows read/search/history/vread for `ClientApplication` so timeline cards can display importer authors such as `ubix-data` rather than `[Forbidden]`, and read/search/history/vread for `EpisodeOfCare` so clinicians can inspect RTW case containers. The provider demo membership profile points to the imported `Dr Alex Demo` practitioner so the Medplum Provider Tasks view has assigned workflow Tasks, including the curated RTW follow-up task.

| App | URL | Username | Password | Profile | Membership |
| --- | --- | --- | --- | --- | --- |
| Patient | `http://127.0.0.1:5173/` | `ubix.patient.riley@example.com` | `Hiive-2pQe87kFXKzlRcC8wmx0GBeo!6` | `Patient/5506b4b2-6557-4876-8367-7e398914bce4` | `ProjectMembership/48db19de-54cc-4233-8376-3739dcf3733d` |
| Provider | `http://127.0.0.1:5172/` | `ubix.provider.alex@example.com` | `Hiive-7jhSWuhQA83-dGrUYkqZrtNE!6` | `Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3` | `ProjectMembership/4e9c0e27-9cfa-4d6b-ac9a-275ae863b9da` |


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
bash ./scripts/deploy-hiive-build-cdk.sh diff
bash ./scripts/deploy-hiive-build-cdk.sh deploy
```

## GitHub Workflow Automation

The hiive-build deployment now has repository-backed GitHub Actions automation for infrastructure and the two user-facing frontend apps.

### Medplum Infrastructure Workflow

- `medplum/.github/workflows/deploy-hiive-build.yml`
	- Manual workflow for `synth`, `diff`, or `deploy` against `medplum.build.config.json`.
	- Uses `scripts/deploy-hiive-build-cdk.sh` so the workflow and local operator commands stay aligned.
	- The helper rebuilds the local `@medplum/core` and `@medplum/cdk` workspaces before `synth`, `diff`, or `deploy`, which avoids silently deploying stale compiled CDK artifacts.

### Frontend Workflows

- `medplum-provider/.github/workflows/build.yml`
	- Installs dependencies, lints, builds, and runs tests on pushes, pull requests, and manual dispatch.

- `medplum-provider/.github/workflows/deploy-hiive-build.yml`
	- Builds and deploys the provider SPA to `provider.ehr.hiivehealth.net` on `main` pushes and manual dispatch.
	- Uses `scripts/deploy-hiive-build.sh` to sync the built `dist/` directory to S3 and create a CloudFront invalidation by looking up the distribution via the configured alias.

- `medplum-patient/.github/workflows/build.yml`
	- Installs dependencies, lints, builds, and runs tests on pushes, pull requests, and manual dispatch.

Local validation status on 2026-05-26:

- `medplum-provider` build workflow path passes locally: lint returns warnings only, build succeeds, and all 98 test files / 1,084 tests pass.
- `medplum-patient` build workflow path passes locally: lint returns warnings only, build succeeds, and tests pass.
- The live hiive-build stack reports `UPDATE_COMPLETE`, and `https://api.ehr.hiivehealth.net/healthcheck` returns `{"ok":true,...}` after deployment.

GitHub deploy workflows now use the repository secret `HIIVE_BUILD_AWS_ROLE_TO_ASSUME` so `aws-actions/configure-aws-credentials` can assume the hiive-build role via OIDC.

- `medplum-patient/.github/workflows/deploy-hiive-build.yml`
	- Builds and deploys the patient SPA to `patient.ehr.hiivehealth.net` on `main` pushes and manual dispatch.
	- Uses `scripts/deploy-hiive-build.sh` to sync the built `dist/` directory to S3 and create a CloudFront invalidation by looking up the distribution via the configured alias.

### GitHub OIDC Configuration

The configured repository secret value is:

- `HIIVE_BUILD_AWS_ROLE_TO_ASSUME=arn:aws:iam::476905305808:role/GitHubActionsRole`

The secret is configured in the origin repositories that own the workflows:

- `clong-viimed/medplum`
- `hiivehealth/medplum-provider`
- `hiivehealth/medplum-patient`

The IAM trust policy on `GitHubActionsRole` currently allows GitHub OIDC subjects from:

- `repo:hiivehealth/hiivecare-build-pipeline:*`
- `repo:clong-viimed/medplum:*`
- `repo:hiivehealth/medplum-provider:*`
- `repo:hiivehealth/medplum-patient:*`

If any of those repositories move to a different owner or slug, update both the repository secret target and the IAM trust policy before relying on GitHub Actions deployments.

The assumed role should allow:

- For `medplum`: CloudFormation/CDK deployment access for the hiive-build Medplum stack.
- For `medplum-provider` and `medplum-patient`: S3 sync access to the target static-site bucket and CloudFront list/invalidation access.

### Manual Workflow Dispatch Order

When dispatching the workflows manually from the GitHub Actions UI, use this order:

1. In `clong-viimed/medplum`, run `deploy-hiive-build.yml` with `action=diff`.
2. If the diff is expected, rerun `deploy-hiive-build.yml` with `action=deploy`.
3. In `hiivehealth/medplum-provider`, run `build.yml`.
4. Then run `deploy-hiive-build.yml` in `hiivehealth/medplum-provider`.
5. In `hiivehealth/medplum-patient`, run `build.yml`.
6. Then run `deploy-hiive-build.yml` in `hiivehealth/medplum-patient`.

After the infrastructure deploy completes, the provider and patient workflow pairs can run in either order or in parallel.

## Related Docs

- `hiive-build-patient-provider-app-plan.md`