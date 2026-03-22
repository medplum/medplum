region             = "ca-central-1"
environment        = "dev"
deployment_id      = "1"
availability_zones = ["ca-central-1a", "ca-central-1b"]

app_domain    = "app.darren-aws.foomedical.dev"
api_domain    = "api.darren-aws.foomedical.dev"
support_email = "darren@medplum.com"

tags = {
  app         = "medplum"
  environment = "dev"
}

# ── Compute ───────────────────────────────────────────────────────────────────
eks_node_instance_types = ["t3.large"]
eks_public_access_cidrs = ["0.0.0.0/0"] # restrict to YOUR_IP/32 before production

# ── Database (Aurora PostgreSQL) ──────────────────────────────────────────────
db_instance_tier = "db.t3.medium"
rds_instances    = 3
postgres_version = "16.8"

# ── Cache ─────────────────────────────────────────────────────────────────────
redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# ── DNS (Route 53) ────────────────────────────────────────────────────────────
# Zone already exists in this account — look it up, don't recreate it.
create_route53_records = true
create_route53_zone    = true
route53_zone_name      = "darren-aws.foomedical.dev"

# ACM certs — existing certs used as overrides. Remove on a fresh deployment to
# let Terraform request and validate certs automatically via Route 53.


# ── Storage CDN (dedicated CloudFront for binary uploads) ─────────────────────
# Cert is created automatically when storage_domain is set. Requires a signing key.
storage_domain = "storage.darren-aws.foomedical.dev"
signing_key_id = "KPPM3VYTOV6KN"

# ── WAF ───────────────────────────────────────────────────────────────────────
enable_waf = true
# Set on second apply once the EKS Ingress ALB is provisioned:
# waf_alb_arn = "arn:aws:elasticloadbalancing:ca-central-1:462446642923:loadbalancer/app/..."

# ── CloudTrail + Alarms ───────────────────────────────────────────────────────
enable_cloudtrail_alarms = false
# cloudtrail_alarm_email   = "darren@medplum.com"

# ── Bot Lambda ────────────────────────────────────────────────────────────────
# Uses the role created by this stack. Override to reuse a pre-existing role:
# bot_lambda_role_arn = ""
