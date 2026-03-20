# Medplum AWS Terraform

Deploys a production-ready Medplum FHIR server on AWS using EKS (Kubernetes), RDS (PostgreSQL), ElastiCache (Redis), S3, CloudFront, and SES.

## What Gets Created

| Resource | Details |
|---|---|
| VPC | Multi-AZ with public, private, database, and cache subnets; VPC flow logs → CloudWatch |
| EKS cluster | Managed node group, IRSA enabled, Kubernetes 1.31 |
| Aurora PostgreSQL | Encrypted Aurora cluster, Secrets Manager rotation, multi-AZ in prod |
| ElastiCache Redis | Encrypted at rest (KMS) and in transit (TLS), auth token |
| S3 | App binary storage bucket (versioned) + static frontend bucket (CloudFront OAC) + optional dedicated storage bucket |
| CloudFront | CDN for the static frontend (CSP/HSTS security headers, WAF); optional dedicated storage CDN with signed URL enforcement |
| WAFv2 | Regional WAF for ALB + CloudFront WAFs for app and storage distributions |
| KMS | Single CMK for Aurora, Redis, Secrets Manager, SSM |
| Secrets Manager | Redis credentials secret, DB connection secret |
| SSM Parameter Store | All Medplum server config parameters, auto-populated |
| IAM | IRSA role for the server pod (SSM, S3, SES, Lambda); bot Lambda execution role; LB controller role |
| SES | Domain identity + DKIM for outbound email |
| Route 53 (optional) | Hosted zone creation (opt-in), DNS records for CloudFront, storage CDN, and SES, and ACM cert DNS validation — opt-in via `create_route53_zone` or `create_route53_records` |
| CloudTrail (optional) | Trail + 10 CloudWatch metric filters + alarms + SNS — opt-in via `enable_cloudtrail_alarms` |

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

### 3. ACM certificates

**If your DNS is in Route 53 in this account (recommended):** skip this step entirely. Terraform requests, validates, and waits for all three ACM certificates automatically — app, ALB, and storage — using DNS validation records written to your hosted zone. No console interaction required.

**If your DNS is managed externally** (Cloudflare, GoDaddy, another Route 53 account, etc.): you must request the certificates manually and supply the resulting ARNs as `ssl_certificate_arn`, `alb_certificate_arn`, and optionally `storage_ssl_certificate_arn` in `terraform.tfvars`. The requirements are:

| Certificate | Region | Covers | Variable |
|---|---|---|---|
| App (CloudFront) | **us-east-1** (CloudFront requirement) | `app_domain` | `ssl_certificate_arn` |
| ALB | Your deployment region | `api_domain` | `alb_certificate_arn` |
| Storage (optional) | **us-east-1** | `storage_domain` | `storage_ssl_certificate_arn` |

To request manually: open [AWS Certificate Manager](https://console.aws.amazon.com/acm/home), request a public certificate for the relevant domain with **DNS validation**, add the CNAME validation record at your DNS provider, and copy the ARN once the status shows **Issued**.

### 3a. Generate a CloudFront signing key (required when `storage_domain` is set)

The dedicated storage CloudFront uses **trusted key groups** to enforce signed URLs on binary content. You must generate an RSA key pair and upload the public key to CloudFront before `terraform apply`.

```bash
# Generate a 2048-bit RSA key pair
openssl genrsa -out cf_signing_key.pem 2048
openssl rsa -pubout -in cf_signing_key.pem -out cf_signing_key_pub.pem

# Upload the public key to CloudFront (in us-east-1)
aws cloudfront create-public-key \
  --public-key-config "CallerReference=$(uuidgen),Name=medplum-storage-signing-key,EncodedKey=$(cat cf_signing_key_pub.pem)" \
  --region us-east-1 \
  --query 'PublicKey.Id' --output text
```

Copy the output key ID and set it as `signing_key_id` in `terraform.tfvars`. Store the private key and passphrase securely — you will need them to configure Medplum server's `signingKey` and `signingKeyPassphrase` settings.

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

### 6. Decide on your DNS and Route 53 setup

There are three modes — pick one and set the corresponding variables in `terraform.tfvars`:

**Mode A — create the hosted zone (fresh deployment, zone doesn't exist yet)**

```hcl
create_route53_zone    = true
create_route53_records = false
route53_zone_name      = "example-aws.yourcompany.com"
```

Terraform creates the zone, writes all DNS and cert validation records into it, and waits for cert issuance. If the parent zone (`yourcompany.com`) is also in Route 53 in this account, also set `parent_route53_zone_id` to that zone's ID and Terraform adds the NS delegation record automatically:

```hcl
parent_route53_zone_id = "Z0123456789EXAMPLE"
```

If the parent is managed externally, leave `parent_route53_zone_id` empty. After apply, run `terraform output route53_nameservers` and add the four NS records at your registrar or parent DNS provider.

**Mode B — hosted zone already exists in this account**

```hcl
create_route53_records = true
create_route53_zone    = false
route53_zone_name      = "example-aws.yourcompany.com"
```

Terraform looks up the existing zone by name and creates all DNS records in it (including cert validation). No manual DNS steps required.

**Mode C — DNS managed externally (Cloudflare, GoDaddy, another Route 53 account, etc.)**

Leave both `create_route53_zone` and `create_route53_records` as `false` (the default). Supply `ssl_certificate_arn` and `alb_certificate_arn` manually (see §3 above). After apply, Terraform outputs the exact DNS records you need to add at your provider.

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

#### Optional — review before deploying

| Variable | Default | Notes |
|---|---|---|
| `region` | `us-east-1` | Change if deploying to another region |
| `environment` | `dev` | Use `prod` for production — enables deletion protection, longer backup retention, multi-AZ Aurora, multi-AZ NAT |
| `availability_zones` | `["us-east-1a", "us-east-1b"]` | Update if you change `region` |
| `deployment_id` | `"1"` | Use to deploy multiple independent stacks in the same account |
| `eks_node_instance_types` | `["t3.large"]` | Use `["m5.large"]` or larger for production workloads |
| `eks_public_access_cidrs` | `["0.0.0.0/0"]` | **Restrict to your IP/VPN CIDR** for any non-throwaway environment |
| `db_instance_tier` | `db.t3.medium` | Use `db.r6g.large` or higher for production |
| `rds_instances` | `1` | Number of Aurora cluster instances. Use `2` for writer + reader in production |
| `redis_node_type` | `cache.t3.micro` | Use `cache.r6g.large` or higher for production |
| `redis_num_cache_nodes` | `1` | Must be `>= 2` when `environment = "prod"` |
| `create_route53_zone` | `false` | Create the Route 53 hosted zone. Use for fresh deployments. See §6 |
| `create_route53_records` | `false` | Look up an existing zone and create DNS records in it. See §6 |
| `route53_zone_name` | `""` | Hosted zone name. Defaults to the root domain (e.g. `yourcompany.com`). **Override if your zone is a subdomain** (e.g. `staging.yourcompany.com`) |
| `parent_route53_zone_id` | `""` | Zone ID of the parent Route 53 zone to add the NS delegation record. Only used when `create_route53_zone = true` |
| `ssl_certificate_arn` | `""` | ACM cert for app CloudFront (must be in us-east-1). Leave empty to auto-create via Route 53 |
| `alb_certificate_arn` | `""` | ACM cert for the ALB (must be in deployment region). Leave empty to auto-create via Route 53 |
| `storage_domain` | `""` | Domain for the dedicated binary storage CDN. Leave empty to disable |
| `storage_ssl_certificate_arn` | `""` | ACM cert for the storage CloudFront (us-east-1). Leave empty to auto-create via Route 53 |
| `signing_key_id` | `""` | CloudFront public key ID for signed storage URLs. See §3a |
| `enable_waf` | `true` | Create WAFv2 Web ACLs for app CloudFront, storage CloudFront, and ALB |
| `waf_alb_arn` | `""` | ALB ARN for the API WAF association. Leave empty on first apply; set once EKS Ingress provisions the LB |
| `api_waf_ip_set_arn` | `""` | Optional existing WAFv2 IP set ARN to restrict API access |
| `app_waf_ip_set_arn` | `""` | Optional existing WAFv2 IP set ARN to restrict app CloudFront access |
| `storage_waf_ip_set_arn` | `""` | Optional existing WAFv2 IP set ARN to restrict storage CloudFront access |
| `enable_cloudtrail_alarms` | `false` | Create CloudTrail trail + 10 CloudWatch alarms + SNS. Recommended for production |
| `cloudtrail_alarm_email` | `""` | Email to subscribe to the CloudTrail alarm SNS topic. After `terraform apply`, AWS sends a confirmation email to this address — **the subscription must be confirmed by clicking the link** before alerts are delivered. |
| `bot_lambda_role_arn` | `""` | Override ARN for the bot Lambda role. Leave empty to use the role created by this stack |

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
| `route53_zone_id` | Zone ID of the managed or looked-up Route 53 zone |
| `route53_nameservers` | Four NS values to add at your registrar (only set when `create_route53_zone = true`) |
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

### Add DNS records (if `create_route53_zone = false` and `create_route53_records = false`)

If you are managing DNS externally (Mode C from §6), add these records at your DNS provider:

| Type | Name | Value |
|---|---|---|
| `CNAME` or `ALIAS` | `<app_domain>` | Value of `cdn_endpoint` output |
| `TXT` | `_amazonses.<domain>` | Value of `ses_domain_verification_token` output |
| `CNAME` | `<token1>._domainkey.<domain>` | `<token1>.dkim.amazonses.com` |
| `CNAME` | `<token2>._domainkey.<domain>` | `<token2>.dkim.amazonses.com` |
| `CNAME` | `<token3>._domainkey.<domain>` | `<token3>.dkim.amazonses.com` |

If you created the zone via `create_route53_zone = true` but left `parent_route53_zone_id` empty, you also need to add the NS delegation records at the parent zone or registrar:

```bash
terraform output route53_nameservers
# Add each of the four values as NS records for <route53_zone_name> at the parent
```

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

**3. Empty the CloudTrail S3 bucket (if `enable_cloudtrail_alarms = true`)** — CloudTrail continuously writes log objects to its S3 bucket. The `force_destroy = true` flag on app and static S3 buckets handles those, but the CloudTrail bucket accumulates versioned objects that must be deleted before Terraform can remove it. If this step is skipped, `terraform destroy` will fail with `BucketNotEmpty`:

```bash
CLOUDTRAIL_BUCKET=$(terraform output -raw cloudtrail_bucket_name 2>/dev/null || echo "")
if [ -n "$CLOUDTRAIL_BUCKET" ]; then
  # Delete all versioned objects and delete markers
  aws s3api delete-objects \
    --bucket "$CLOUDTRAIL_BUCKET" \
    --delete "$(aws s3api list-object-versions \
      --bucket "$CLOUDTRAIL_BUCKET" \
      --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
      --output json)" || true
  # Repeat for delete markers
  aws s3api delete-objects \
    --bucket "$CLOUDTRAIL_BUCKET" \
    --delete "$(aws s3api list-object-versions \
      --bucket "$CLOUDTRAIL_BUCKET" \
      --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
      --output json)" || true
fi
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
| `versions.tf` | Terraform and provider version constraints; `aws.us_east_1` provider alias for CloudFront WAFs |
| `locals.tf` | Computed local values (`name_prefix`, `ssm_prefix`, `ses_domain`, `storage_cdn_enabled`, `effective_zone_id`, cert management locals) |
| `variables.tf` | All input variable declarations |
| `network.tf` | VPC, subnets, NAT gateway, VPC flow logs |
| `kubernetes.tf` | EKS cluster and managed node group |
| `database.tf` | Aurora PostgreSQL cluster, subnet group, security group, EKS node security group |
| `cache.tf` | ElastiCache Redis replication group |
| `storage.tf` | S3 buckets (app storage + static frontend) |
| `storage_cdn.tf` | Dedicated binary storage S3 + CloudFront + OAC + key group (opt-in) |
| `cdn.tf` | CloudFront distribution for app with security response headers policy |
| `certs.tf` | ACM certificate requests, Route 53 DNS validation records, and certificate validation waits |
| `security.tf` | KMS key, Secrets Manager secret |
| `iam.tf` | IRSA roles and policies for server pod and LB controller |
| `lb_controller.tf` | AWS Load Balancer Controller IAM role and policy |
| `bot.tf` | Medplum bot Lambda execution role |
| `waf.tf` | WAFv2 Web ACLs for ALB (regional) and CloudFront distributions (us-east-1) |
| `cloudtrail.tf` | CloudTrail trail, CloudWatch log group, metric filters, alarms, SNS (opt-in) |
| `ssm.tf` | SSM Parameter Store config + Redis/DB secret versions |
| `ses.tf` | SES domain and email identity |
| `dns.tf` | Route 53 zone creation (opt-in), NS delegation (opt-in), and DNS records for CloudFront, storage, and SES |
| `backend.tf` | S3 remote state backend (uncomment after bootstrap) |
| `outputs.tf` | All Terraform output values |
| `terraform.tfvars.example` | Copy to `terraform.tfvars` and fill in |
| `bootstrap/` | One-time module to create the S3 state bucket and DynamoDB lock table |