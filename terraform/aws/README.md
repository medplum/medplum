# Medplum AWS Terraform

Deploys a production-ready Medplum FHIR server on AWS using EKS (Kubernetes), RDS (PostgreSQL), ElastiCache (Redis), S3, CloudFront, and SES.

## What Gets Created

| Resource | Details |
|---|---|
| VPC | Multi-AZ with public, private, database, and cache subnets |
| EKS cluster | Managed node group, IRSA enabled, Kubernetes 1.31 |
| RDS PostgreSQL | Encrypted, Secrets Manager rotation, multi-AZ in prod |
| ElastiCache Redis | Encrypted at rest (KMS) and in transit (TLS), auth token |
| S3 | App binary storage bucket (versioned) + static frontend bucket (CloudFront OAC) |
| CloudFront | CDN for the static frontend with custom domain + ACM TLS |
| KMS | Single CMK for RDS, Redis, Secrets Manager, SSM |
| Secrets Manager | Redis credentials secret |
| SSM Parameter Store | All Medplum server config parameters, auto-populated |
| IAM | IRSA role for the server pod (SSM, S3, SES, Lambda) |
| SES | Domain identity + DKIM for outbound email |
| Route 53 (optional) | DNS records for CloudFront and SES — opt-in via `create_route53_records` |

---

## Prerequisites

Complete all of these before running `terraform apply`.

### 1. Install required tools

```bash
# Terraform >= 1.5
brew install terraform

# AWS CLI v2
brew install awscli

# kubectl
brew install kubectl

# Helm 3
brew install helm
```

Verify:

```bash
terraform version   # must be >= 1.5
aws --version
kubectl version --client
helm version
```

### 2. Configure AWS credentials

The IAM principal running Terraform needs broad permissions (AdministratorAccess or equivalent). Configure one of:

```bash
# Option A — named profile
aws configure --profile medplum
export AWS_PROFILE=medplum

# Option B — environment variables
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1

# Option C — SSO
aws sso login --profile medplum
export AWS_PROFILE=medplum
```

Confirm the right account is active:

```bash
aws sts get-caller-identity
```

### 3. Request ACM certificates

You will need two ACM certificates:

**CloudFront certificate (required):**
- Must be in **us-east-1** (CloudFront requirement), regardless of your deployment region
- Must cover your app domain (e.g. `medplum.yourcompany.com`)

**ALB certificate (required):**
- Must be in the same region as your deployment (e.g. `us-east-1`, `us-west-2`, etc.)
- Must cover your API domain (e.g. `medplum-api.yourcompany.com` or `api.medplum.yourcompany.com`)
- If deploying to us-east-1, a single certificate with both the app and API domains as SANs can be used for both purposes

**To request the CloudFront certificate:**

1. Open the [AWS Certificate Manager console](https://console.aws.amazon.com/acm/home?region=us-east-1) — ensure the region selector shows **US East (N. Virginia)**
2. Click **Request** → **Request a public certificate**
3. Enter your domain name (e.g. `medplum.yourcompany.com`). If deploying to us-east-1 and want a single cert for both, also add `medplum-api.yourcompany.com`
4. Choose **DNS validation** (recommended) and follow the prompts
5. Wait for the status to show **Issued**, then copy the **Certificate ARN** — use it as `ssl_certificate_arn` in your tfvars

**To request the ALB certificate (if deploying to a region other than us-east-1):**

1. Open the [AWS Certificate Manager console](https://console.aws.amazon.com/acm/home) — switch to your deployment region
2. Click **Request** → **Request a public certificate**
3. Enter your API domain (e.g. `medplum-api.yourcompany.com`)
4. Choose **DNS validation** and follow the prompts
5. Once issued, copy the **Certificate ARN** — use it as `alb_certificate_arn` in your tfvars

### 4. Verify your sending domain in SES (if not already done)

Terraform will create SES identity resources and output the verification tokens, but AWS SES also needs to be out of the **sandbox** before it can send to arbitrary addresses.

- If this is a new AWS account, [request SES production access](https://console.aws.amazon.com/ses/home#/account) before deploying
- If you only need to send to verified addresses (fine for dev/test), you can skip this — the sandbox restriction only affects sending to unverified recipients

### 5. Check your Elastic IP quota

Each NAT gateway requires one Elastic IP (EIP). This module creates one NAT gateway per availability zone (2 by default), consuming 2 EIPs. The default AWS quota is **5 EIPs per region**, so if you are already near the limit the apply will fail with `AddressLimitExceeded`.

Check your current usage before deploying:

```bash
aws ec2 describe-addresses --region <your-region> \
  --query 'Addresses[*].{IP:PublicIp,AssociationId:AssociationId}' \
  --output table
```

Release any unassociated EIPs to free up capacity, or [request a quota increase](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas) for `EC2-VPC Elastic IPs` before running `terraform apply`.

> **Tip:** Regions you haven't heavily used (e.g. `ca-central-1`) typically have all 5 EIPs available. `us-east-1` is commonly exhausted on shared/dev accounts.

### 6. Decide on your DNS setup

There are two options:

**Option A — DNS is hosted in Route 53 in this same AWS account**
Set `create_route53_records = true` in your `terraform.tfvars`. Terraform will create all DNS records automatically.

**Option B — DNS is managed elsewhere (Cloudflare, GoDaddy, external Route 53 account, etc.)**
Leave `create_route53_records = false` (the default). After `terraform apply`, Terraform outputs the exact records you need to add manually.

---

## Setup

### Step 1 — Copy and fill in your variables

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and set these values:

#### Required — no defaults, must be set

| Variable | Description | Example |
|---|---|---|
| `app_domain` | Full domain for the Medplum app (frontend, served by CloudFront) | `medplum.yourcompany.com` |
| `api_domain` | Domain for the Medplum API server (served by ALB) | `medplum-api.yourcompany.com` |
| `support_email` | Email address Medplum sends from | `support@yourcompany.com` |
| `ssl_certificate_arn` | ACM certificate ARN for CloudFront (must be in us-east-1) from Step 3 | `arn:aws:acm:us-east-1:123456789012:certificate/abc-def` |
| `alb_certificate_arn` | ACM certificate ARN for the ALB (must be in deployment region) from Step 3 | `arn:aws:acm:us-east-1:123456789012:certificate/alb-def` |

#### Optional — review before deploying

| Variable | Default | Notes |
|---|---|---|
| `region` | `us-east-1` | Change if deploying to another region; CloudFront cert must stay in `us-east-1` but ALB cert must be in this region |
| `environment` | `dev` | Use `prod` for production — enables deletion protection, longer backup retention, multi-AZ RDS, multi-AZ NAT |
| `availability_zones` | `["us-east-1a", "us-east-1b"]` | Update if you change `region` |
| `deployment_id` | `"1"` | Use to deploy multiple independent stacks in the same account (affects resource naming) |
| `eks_node_instance_types` | `["t3.large"]` | Use `["m5.large"]` or larger for production workloads |
| `eks_public_access_cidrs` | `["0.0.0.0/0"]` | **Restrict to your IP/VPN CIDR** — e.g. `["203.0.113.0/32"]` — for any non-throwaway environment |
| `db_instance_tier` | `db.t3.medium` | Use `db.r6g.large` or higher for production |
| `db_storage_gb` | `32` | Increase for production |
| `redis_node_type` | `cache.t3.micro` | Use `cache.r6g.large` or higher for production |
| `redis_num_cache_nodes` | `1` | Must be `>= 2` when `environment = "prod"` (required for automatic failover) |
| `create_route53_records` | `false` | Set `true` if DNS is in Route 53 in this account |
| `route53_zone_name` | `""` | Hosted zone name for DNS records. Defaults to root domain (e.g. `yourcompany.com`). **Override this if your hosted zone is a subdomain** (e.g. `staging.yourcompany.com`) — using the wrong zone causes SES records to be created with malformed names |
| `bot_lambda_role_arn` | `""` | Leave empty on first deploy; fill in after you configure Medplum bots |

### Step 2 — Bootstrap remote state (one-time only)

Terraform state must be stored in S3 before the backend can be enabled. Run the bootstrap module once:

```bash
cd terraform/aws/bootstrap
terraform init
terraform apply
```

Note the S3 bucket name in the output (it will be `medplum-tf-state-<YOUR_ACCOUNT_ID>`).

Then open `terraform/aws/backend.tf`:
1. Replace `<YOUR_ACCOUNT_ID>` with your actual AWS account ID
2. Uncomment the `terraform { backend "s3" { ... } }` block

### Step 3 — Initialize

```bash
cd terraform/aws
terraform init
```

If prompted to migrate existing local state to S3, answer **yes**.

### Step 4 — Preview the plan

```bash
terraform plan -var-file=terraform.tfvars
```

Review the output carefully. Expect approximately 50–60 resources on a fresh deploy. The plan should show no unexpected destructive changes.

### Step 5 — Apply

```bash
terraform apply -var-file=terraform.tfvars
```

Type `yes` when prompted. **This takes 15–25 minutes** — EKS cluster creation is the slowest step.

---

## After Apply

### Collect outputs

```bash
terraform output
```

Key values you will need:

| Output | Used for |
|---|---|
| `region` | AWS region (used in kubectl and S3 commands) |
| `cluster_name` | Connecting `kubectl` |
| `api_domain` | Medplum server API domain (used in Helm values) |
| `ssm_config_path` | Medplum server config path (e.g. `/medplum-dev-1`) — use as part of: `aws:<region>:<ssm_config_path>/` |
| `server_iam_role_arn` | Kubernetes ServiceAccount annotation (IRSA) |
| `lb_controller_iam_role_arn` | AWS Load Balancer Controller IRSA role |
| `alb_certificate_arn` | ALB listener certificate (passed to Helm) |
| `static_storage_name` | S3 bucket for the frontend static build (sync `dist/` here) |
| `cdn_hostname` | CloudFront custom domain — add as CNAME in DNS for app domain |
| `cdn_endpoint` | CloudFront distribution domain (e.g. `d1234.cloudfront.net`) |
| `ses_domain_verification_token` | DNS TXT record for SES domain verification |
| `ses_dkim_tokens` | Three DNS CNAME records for DKIM |

### Deploy the static frontend to S3

Terraform creates the S3 bucket for the static frontend, but you must build and upload the Medplum app.

> **Important:** The static frontend goes into the **`static_storage_name`** bucket, which is served by CloudFront.
> The `app_storage_name` bucket is for server binary uploads — do not sync the frontend there.

1. **Set the API URL and build the app** (run from the repo root):
   ```bash
   cat > packages/app/.env <<EOF
   MEDPLUM_BASE_URL=https://$(terraform output -raw api_domain)/
   MEDPLUM_CLIENT_ID=
   GOOGLE_CLIENT_ID=
   RECAPTCHA_SITE_KEY=6LfHdsYdAAAAAC0uLnnRrDrhcXnziiUwKd8VtLNq
   MEDPLUM_REGISTER_ENABLED=true
   EOF

   cd packages/app && npm run build
   ```

2. **Upload to the static website bucket**:
   ```bash
   aws s3 sync dist/ s3://$(terraform output -raw static_storage_name)/ \
     --region $(terraform output -raw region)
   ```

3. **Invalidate the CloudFront cache**:
   ```bash
   DIST_ID=$(aws cloudfront list-distributions \
     --query "DistributionList.Items[?Aliases.Items[?@=='$(terraform output -raw cdn_hostname)']].Id" \
     --output text)
   aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
   ```

4. Your app is now live at `https://$(terraform output -raw cdn_hostname)`

### Connect kubectl

```bash
aws eks update-kubeconfig \
  --region $(terraform output -raw region) \
  --name $(terraform output -raw cluster_name)

kubectl get nodes   # should show 2 Ready nodes after 1–2 minutes
```

### Add DNS records (if `create_route53_records = false`)

Add these records at your DNS provider:

| Type | Name | Value |
|---|---|---|
| `CNAME` or `ALIAS` | `<app_domain>` | Value of `cdn_endpoint` output |
| `TXT` | `_amazonses.<domain>` | Value of `ses_domain_verification_token` output |
| `CNAME` | `<token1>._domainkey.<domain>` | `<token1>.dkim.amazonses.com` |
| `CNAME` | `<token2>._domainkey.<domain>` | `<token2>.dkim.amazonses.com` |
| `CNAME` | `<token3>._domainkey.<domain>` | `<token3>.dkim.amazonses.com` |

After deploying the API server (see Helm deployment below), get the ALB hostname and add the API record:

```bash
kubectl -n medplum get ingress
# NAME      CLASS   HOSTS                         ADDRESS                                                   PORTS
# medplum   alb     api.yourcompany.com            k8s-medplum-abc123.ca-central-1.elb.amazonaws.com         443
```

| Type | Name | Value |
|---|---|---|
| `CNAME` | `<api_domain>` (e.g., `api.yourcompany.com`) | ALB hostname from the `ADDRESS` column above |

> **DNS propagation note:** After adding records, your local machine may still fail to resolve them if your router or ISP has cached a negative (NXDOMAIN) response. To verify the records are correct independently of your local cache, query a public resolver directly:
> ```bash
> dig @8.8.8.8 api.yourcompany.com
> dig @8.8.8.8 app.yourcompany.com
> ```
> If those return IPs but your browser still shows `DNS_PROBE_FINISHED_NXDOMAIN`, the issue is your router's DNS cache (not your Mac's). The permanent fix is to set your Mac's DNS servers to bypass the router entirely:
> ```bash
> # macOS — sets DNS to Google + Cloudflare, bypassing the router
> networksetup -setdnsservers Wi-Fi 8.8.8.8 1.1.1.1
> sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
> ```
> `dscacheutil -flushcache` alone only clears your Mac's cache — it has no effect on the router's cached NXDOMAIN.

### Deploy Medplum API server

Once the cluster is running and your outputs are collected, follow the Helm deployment guide in [`charts/README.md`](../../charts/README.md) to deploy the Medplum server. The AWS section there covers installing the AWS Load Balancer Controller and configuring `values.yaml` with the outputs from this module.

---

## Destroying the Environment

> **Warning:** This permanently deletes all data including the RDS database (unless `environment = "prod"`, which enables deletion protection).

> **Warning:** You must destroy using the **same `region`** that was used during `terraform apply`. If you change `region` in `terraform.tfvars` and then run `terraform destroy`, Terraform will try to access S3 buckets through the wrong regional endpoint and fail with `PermanentRedirect` errors. Always destroy with the original region.

### Before destroying

Run these steps first, otherwise `terraform apply` on the next deploy will fail:

**1. Uninstall the Helm release** — ensures the ALB is deprovisioned cleanly before Terraform removes the EKS cluster:

```bash
helm uninstall medplum --namespace medplum
kubectl delete namespace medplum
# wait ~60 seconds for the ALB to be removed
```

**2. Remove the `app` CNAME from Route 53** — CloudFront will create a new distribution with a new domain on the next deploy. If the old CNAME still exists pointing at the old distribution, the new distribution will fail with `CNAMEAlreadyExists`:

```bash
APP_CNAME=$(terraform output -raw cdn_endpoint)
HOSTED_ZONE_ID=<YOUR_HOSTED_ZONE_ID>

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"DELETE\",
      \"ResourceRecordSet\": {
        \"Name\": \"$(terraform output -raw cdn_hostname)\",
        \"Type\": \"CNAME\",
        \"TTL\": 300,
        \"ResourceRecords\": [{\"Value\": \"$APP_CNAME\"}]
      }
    }]
  }"
```

### Destroy

```bash
terraform destroy -var-file=terraform.tfvars
```

The S3 buckets are emptied automatically (`force_destroy = true`). Secrets Manager secrets are deleted immediately (`recovery_window_in_days = 0`). After destroy completes, all EIPs are released.

---

## File Reference

| File | Purpose |
|---|---|
| `versions.tf` | Terraform and provider version constraints |
| `locals.tf` | Computed local values (`name_prefix`, `ssm_prefix`, `ses_domain`) |
| `variables.tf` | All input variable declarations |
| `network.tf` | VPC, subnets, NAT gateway |
| `kubernetes.tf` | EKS cluster and managed node group |
| `database.tf` | RDS PostgreSQL, subnet group, security group, EKS node security group |
| `cache.tf` | ElastiCache Redis replication group |
| `storage.tf` | S3 buckets (app storage + static frontend) |
| `cdn.tf` | CloudFront distribution with OAC |
| `security.tf` | KMS key, Secrets Manager secret |
| `iam.tf` | IRSA roles and policies for server pod and LB controller |
| `lb_controller.tf` | AWS Load Balancer Controller IAM role and policy |
| `ssm.tf` | SSM Parameter Store config + Redis secret version |
| `ses.tf` | SES domain and email identity |
| `dns.tf` | Route 53 records (opt-in) |
| `backend.tf` | S3 remote state backend (uncomment after bootstrap) |
| `outputs.tf` | All Terraform output values |
| `terraform.tfvars.example` | Copy to `terraform.tfvars` and fill in |
| `bootstrap/` | One-time module to create the S3 state bucket and DynamoDB lock table |
