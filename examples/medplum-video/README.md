# Medplum LiveKit Video Visits

A FHIR-native video visit module for Medplum using LiveKit. Provides real-time telehealth with
AI agent support (scribe, intake, coding) — all modeled in FHIR R4.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Provider App / Patient Portal (React)                      │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ VideoRoom        │  │ WaitingRoom      │                 │
│  │ VideoLobby       │  │ PatientVideoPage │                 │
│  │ AiAgentIndicator │  │ UpcomingVisits   │                 │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │ useVideoVisit        │ useEncounterSync          │
├───────────┼──────────────────────┼──────────────────────────┤
│  Medplum Server (FHIR R4)       │                           │
│  ┌─────────┐ ┌──────────┐ ┌────┴────┐ ┌──────────────┐    │
│  │Encounter│ │Appointment│ │Communic.│ │DocumentRef   │    │
│  │(VR)     │ │           │ │(transcript)│(AI notes)    │    │
│  └────┬────┘ └──────────┘ └─────────┘ └──────────────┘    │
│       │ Subscriptions                                       │
│  ┌────┴──────────────────────────────────┐                  │
│  │ Bots: create-room, token, admit,      │                  │
│  │       lifecycle, post-visit-summarize  │                  │
│  └───────────────────────────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  LiveKit Server (self-hosted)                               │
│  ┌──────────┐  ┌─────────────────────────┐                  │
│  │ SFU      │  │ AI Agents (TS)          │                  │
│  │ WebRTC   │  │ ScribeAgent             │                  │
│  │ Rooms    │  │ IntakeAgent             │                  │
│  │          │  │ CodingAgent             │                  │
│  └──────────┘  └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/bots/` | Medplum Bots — room provisioning, token generation, lifecycle management |
| `packages/react/` | React components + hooks — VideoRoom, WaitingRoom, VideoLobby, etc. |
| `packages/agents/` | LiveKit AI Agents — scribe, intake, coding assistant |
| `packages/test-harness/` | Standalone Vite app for testing both provider and patient views |

## Quick Start

### 1. Start LiveKit Server

```bash
docker-compose up livekit
```

### 2. Configure Bot Secrets

Set these secrets on your Medplum Bots (via app.medplum.com or CLI):

- `LIVEKIT_API_KEY` — default `devkey` for local dev
- `LIVEKIT_API_SECRET` — default `secret` for local dev
- `LIVEKIT_HOST` — `http://localhost:7880`
- `LIVEKIT_WS_URL` — `ws://localhost:7880`

### 3. Seed FHIR Data

```bash
medplum post fhir/sample-data/video-visit-bundle.json
```

### 4. Deploy Bots

```bash
cd packages/bots
npm run build
medplum bot deploy create-video-room
medplum bot deploy generate-token
medplum bot deploy admit-patient
medplum bot deploy start-adhoc-visit
medplum bot deploy on-encounter-status-change
medplum bot deploy post-visit-summarize
```

### 5. Run Test Harness

```bash
cd packages/test-harness
npm run dev
# Open http://localhost:5173
```

### 6. Run AI Agents (optional)

```bash
cd packages/agents
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

## FHIR Resource Model

All video visit state lives in FHIR R4 — no sidecar databases.

### Encounter Lifecycle

```
Scheduled:  planned → arrived → in-progress → finished
Ad-hoc:     arrived → in-progress → finished
```

### Key Extensions

| Extension | Type | Description |
|-----------|------|-------------|
| `livekit-room-name` | valueString | LiveKit room name |
| `livekit-room-sid` | valueString | LiveKit room SID |
| `video-visit-mode` | valueCode | `scheduled` or `ad-hoc` |
| `waiting-room-status` | valueCode | `not-waiting`, `waiting`, `admitted`, `declined` |
| `room-grace-period-minutes` | valueInteger | Empty room timeout (default 15) |

## Deployment Modes

### Mode A: Local Development

- LiveKit Server via `docker-compose up`
- Medplum hosted at `api.medplum.com` or local stack
- Agents run locally via `tsx src/entrypoint.ts dev`

### Mode B: Medplum-Hosted + Client LiveKit

- Medplum hosted at `api.medplum.com`
- LiveKit Server on client's AWS/GCP (Docker, ECS, or Kubernetes)
- Agents co-located with LiveKit Server

### Mode C: Fully Self-Hosted

- Medplum self-hosted via CDK (AWS)
- LiveKit Server self-hosted
- Full HIPAA control — client owns entire stack

## Hosted Test Harness

The test harness can be deployed to AWS ECS as a shareable URL (e.g. `https://tele.medplum.dev`)
connected to a Medplum server (typically staging). This is useful for testing on mobile devices
over HTTPS — `getUserMedia()` requires a secure context.

### Architecture

```
Browser  ──https──►  ALB (ACM cert)  ──HTTP──►  ECS Fargate (nginx + SPA)
                                                     │
                                                     │  config.js with Medplum creds
                                                     ▼
                                              Medplum staging API
                                              LiveKit server (livekit.medplum.dev)
```

The test-harness module **shares the VPC, public subnets, and ECS cluster**
provisioned by the `livekit` module (wired up via `terraform_remote_state`).
You must run `make apply MODULE=livekit ENV=<env>` before the test-harness
has anything to attach to.

At container start, `entrypoint.sh` templates runtime env vars into
`/usr/share/nginx/html/config.js`, which sets `window.__MEDPLUM_VIDEO_CONFIG__` before
the SPA bundle loads. This means the same image can be redeployed against any Medplum
environment without a rebuild.

### First-time setup

```bash
cd infrastructure

# 1. Edit dev config with your Medplum staging credentials + bot IDs.
$EDITOR terraform/test-harness/terraform.tfvars.dev

# 2. One-shot: bootstrap IAM roles, create ECR, build+push image, apply TF.
make setup MODULE=test-harness ENV=dev PROFILE=medplum
```

The `setup` target will:

1. Pre-create the ECS task roles via the AWS CLI (`iam-bootstrap`)
2. `terraform apply -target=aws_ecr_repository.test_harness` to create the ECR repo
3. Build the `infrastructure/test-harness/Dockerfile` image and push to ECR
4. `terraform apply` the remaining infra (VPC, ALB, ACM, Route53, ECS service)

Terraform outputs the public URL once the ACM cert is validated and the service is running.

### Re-deploying a new build

```bash
cd infrastructure
make push-image   MODULE=test-harness ENV=dev PROFILE=medplum   # build + push :latest
make force-deploy MODULE=test-harness ENV=dev PROFILE=medplum   # rolling ECS deploy
```

### Updating runtime config

Runtime values (Medplum base URL, client ID/secret, bot IDs, default patient/practitioner,
environment label) are passed as container env vars and/or SSM secrets, all controlled by
`terraform.tfvars.dev`. To change them:

```bash
$EDITOR terraform/test-harness/terraform.tfvars.dev
make apply        MODULE=test-harness ENV=dev PROFILE=medplum
make force-deploy MODULE=test-harness ENV=dev PROFILE=medplum
```

### Destroying

```bash
make destroy MODULE=test-harness ENV=dev PROFILE=medplum
```

> Security note: `medplum_client_secret` is stored as an SSM SecureString and is injected
> into `config.js` at container startup. Because the SPA is a browser app, the secret is
> ultimately downloaded by every client. Only use test/staging credentials bound to a
> low-privilege ClientApplication. For production, replace with per-user OAuth login.
