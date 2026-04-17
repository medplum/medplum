# Deployment Guide

## Local Development

### Prerequisites

- Node.js ^22.18.0 || >=24.2.0
- Docker & Docker Compose
- Medplum account (hosted or local)

### Setup

```bash
# Start LiveKit Server
docker-compose up livekit

# In another terminal — start AI agents (optional)
cd packages/agents
cp .env.example .env
# Edit .env with your Medplum + AI provider credentials
npm run dev

# In another terminal — start test harness
cd packages/test-harness
npm run dev
```

### Environment Variables

Create a `.env` file in the project root for docker-compose:

```env
MEDPLUM_BASE_URL=https://api.medplum.com
MEDPLUM_CLIENT_ID=your_client_id
MEDPLUM_CLIENT_SECRET=your_client_secret
DEEPGRAM_API_KEY=your_deepgram_key
OPENAI_API_KEY=your_openai_key
```

## Production Deployment

### LiveKit Server on AWS ECS (Terraform — recommended)

A ready-to-use Terraform module lives in `infrastructure/terraform/livekit/`.
It provisions the full AWS stack:

| Resource | Details |
|---|---|
| **VPC** | Dedicated VPC with public + private subnets across 2 AZs |
| **ECS Fargate** | LiveKit runs as a Fargate task in private subnets |
| **Network Load Balancer** | Internet-facing NLB handles all ports (WSS, UDP RTC, TURN) |
| **ACM Certificate** | DNS-validated TLS cert auto-provisioned for your domain |
| **Route53 Record** | `<prefix>.<zone>` alias → NLB (default: `livekit.medplum.dev`) |
| **ECR** | Private registry for the LiveKit wrapper image |
| **SSM Parameter Store** | Config YAML (String) and API key:secret (SecureString) |
| **VPC Endpoints** | ECR, SSM, CloudWatch Logs kept off the public internet |

**Quick start:**

```bash
cd infrastructure

# 1. Copy and fill in variables
cp terraform/livekit/terraform.tfvars.example terraform/livekit/terraform.tfvars
# Edit terraform.tfvars: route53_zone_id, domain_prefix, livekit_api_key, livekit_api_secret

# 2. Full first-time deploy (creates ECR → pushes image → deploys everything)
make setup

# 3. Print the LiveKit URL and Medplum bot secrets
cd terraform/livekit && terraform output
```

After deploy, copy the `medplum_bot_secrets` output values into your Medplum
project's bot secrets (see [Medplum Bot Secrets](#medplum-bot-secrets) below).

**Subsequent image updates:**

```bash
make push-image      # rebuild & push a new image revision
make force-deploy    # force ECS to pull the new image
```

**DNS & domain variables:**

| Variable | Default | Description |
|---|---|---|
| `route53_zone_id` | _(required)_ | Route53 Hosted Zone ID |
| `domain_prefix` | `livekit` | Subdomain prefix (e.g. `livekit` → `livekit.medplum.dev`) |
| `aws_region` | `us-east-1` | AWS region |

**Architecture notes:**

- TLS is terminated at the NLB (ACM cert). The container receives plain HTTP/WS and TCP; `external_tls: true` is set in the LiveKit config accordingly.
- Fargate tasks run in **private subnets** behind NAT; clients reach LiveKit exclusively through the NLB.
- WebRTC media uses the built-in LiveKit TURN relay (`turn.domain = <your-domain>`) because Fargate's NAT prevents direct ICE connectivity.
- Scaling beyond 1 task requires a Redis cluster for room routing (not included). Set `ecs_desired_count = 1` until Redis is added.

---

### LiveKit Server (manual options)

**Single-node Docker (small practices, < 50 concurrent rooms):**

```bash
docker run -d \
  --name livekit \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="your-api-key:your-api-secret" \
  livekit/livekit-server:latest \
  --bind 0.0.0.0
```

**Multi-node (Kubernetes):**

- Use LiveKit's Helm chart
- Configure Redis for room routing
- Deploy agents as a separate Deployment/StatefulSet

### TLS & TURN

Production requires TLS on all LiveKit endpoints:

- **WebSocket**: `wss://livekit.yourdomain.com`
- **TURN**: Configure with coturn or LiveKit's built-in TURN server
- Use nginx, caddy, or an NLB for TLS termination (the Terraform module handles this automatically)

### Agent Deployment

```bash
cd packages/agents
docker build --build-arg NODE_VERSION=22 -t medplum-video-agents .
docker run -d \
  --name medplum-video-agents \
  -e LIVEKIT_URL=wss://livekit.yourdomain.com \
  -e LIVEKIT_API_KEY=your-key \
  -e LIVEKIT_API_SECRET=your-secret \
  -e MEDPLUM_BASE_URL=https://api.medplum.com \
  -e MEDPLUM_CLIENT_ID=your_client_id \
  -e MEDPLUM_CLIENT_SECRET=your_client_secret \
  medplum-video-agents
```

### Medplum Bot Secrets

Configure these secrets on each Bot via the Medplum app or CLI:

| Secret | Description |
|--------|-------------|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_HOST` | LiveKit HTTP endpoint (e.g. `https://livekit.yourdomain.com`) |
| `LIVEKIT_WS_URL` | LiveKit WebSocket endpoint (e.g. `wss://livekit.yourdomain.com`) |

## HIPAA Considerations

- LiveKit Server is self-hosted — no third-party video data processor
- TLS required on all LiveKit endpoints in production
- Enable E2EE (end-to-end encryption) if required by policy
- AI agent service account has scoped AccessPolicy
- Egress recordings stored in encrypted S3 with lifecycle policies
- Medplum automatically creates AuditEvent for all FHIR operations
