# Route 53 — zone creation (opt-in) + DNS records for CloudFront, storage, and SES
#
# Three modes are supported:
#
#   1. create_route53_zone = true
#      Terraform creates the hosted zone. If parent_route53_zone_id is also set,
#      Terraform adds an NS delegation record in the parent zone automatically.
#      Otherwise, the output "route53_nameservers" lists the four NS values to add
#      manually at your registrar or parent DNS provider.
#
#   2. create_route53_zone = false, create_route53_records = true
#      The hosted zone already exists in this account. Terraform looks it up by
#      name (route53_zone_name, or the root domain derived from app_domain).
#
#   3. create_route53_zone = false, create_route53_records = false
#      No Route 53 operations. Cert ARNs must be provided manually via variables.
#
# NOTE — API server record intentionally omitted:
#   The API ALB hostname is only known after EKS Ingress is provisioned. Add the
#   CNAME manually, or set waf_alb_arn on a second apply to trigger it.

locals {
  dns_zone_name = var.route53_zone_name != "" ? var.route53_zone_name : local.ses_domain

  # AWS's fixed global hosted zone ID for all CloudFront distributions.
  # This value is a well-known constant documented by AWS and does not change.
  # https://docs.aws.amazon.com/Route53/latest/APIReference/API_AliasTarget.html
  cloudfront_hosted_zone_id = "Z2FDTNDATAQYW2"
}

# ── Mode 1: TF-managed zone ───────────────────────────────────────────────────

resource "aws_route53_zone" "managed" {
  count = var.create_route53_zone ? 1 : 0
  name  = local.dns_zone_name

  tags = var.tags
}

# Optional: add NS delegation record in a parent zone that is also in this account.
resource "aws_route53_record" "ns_delegation" {
  count = var.create_route53_zone && var.parent_route53_zone_id != "" ? 1 : 0

  zone_id = var.parent_route53_zone_id
  name    = local.dns_zone_name
  type    = "NS"
  ttl     = 300
  records = aws_route53_zone.managed[0].name_servers
}

# ── Mode 2: look up existing zone ────────────────────────────────────────────

data "aws_route53_zone" "existing" {
  count = var.create_route53_records && !var.create_route53_zone ? 1 : 0

  name         = "${local.dns_zone_name}."
  private_zone = false
}

# ── DNS records (active in mode 1 or 2) ──────────────────────────────────────

# CloudFront alias record for the app domain
resource "aws_route53_record" "cloudfront_alias" {
  count = local.dns_zone_available ? 1 : 0

  zone_id = local.effective_zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.medplum.domain_name
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# Storage CloudFront alias record (only when storage CDN is enabled)
resource "aws_route53_record" "storage_alias" {
  count = local.dns_zone_available && local.storage_cdn_enabled ? 1 : 0

  zone_id = local.effective_zone_id
  name    = var.storage_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.storage[0].domain_name
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# SES domain TXT verification record
resource "aws_route53_record" "ses_verification" {
  count = local.dns_zone_available ? 1 : 0

  zone_id = local.effective_zone_id
  name    = "_amazonses.${local.dns_zone_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.medplum.verification_token]
}

# SES DKIM CNAME records (3 tokens)
resource "aws_route53_record" "ses_dkim" {
  count = local.dns_zone_available ? 3 : 0

  zone_id = local.effective_zone_id
  name    = "${aws_ses_domain_dkim.medplum.dkim_tokens[count.index]}._domainkey.${local.dns_zone_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.medplum.dkim_tokens[count.index]}.dkim.amazonses.com"]
}
