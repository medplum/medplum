# Route 53 — zone creation (opt-in) + DNS records for CloudFront, storage, SES, and API ALB
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

# API ALB alias record.
#
# The AWS Load Balancer Controller creates and owns the ALB for the API.
# After running `helm install` / `helm upgrade`, retrieve the hostname:
#
#   kubectl get ingress -n medplum medplum \
#     -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
#
# Set helm_api_alb_hostname in terraform.tfvars to that value and re-run
# `terraform apply` to point the Route 53 record at the correct ALB.

# ALB canonical hosted zone IDs per region.
# Source: https://docs.aws.amazon.com/general/latest/gr/elb.html
locals {
  alb_zone_ids = {
    "af-south-1"     = "Z268VQBMOI5EKX"
    "ap-east-1"      = "Z3DQVH9N71FHZ0"
    "ap-northeast-1" = "Z14GRHDCWA56QT"
    "ap-northeast-2" = "ZWKZPGTI48KDX"
    "ap-northeast-3" = "Z5LXEXXYW11ES"
    "ap-south-1"     = "ZP97RAFLXTNZK"
    "ap-south-2"     = "Z0173938T07WNTVAEPZN"
    "ap-southeast-1" = "Z1LMS91P8CMLE5"
    "ap-southeast-2" = "Z1GM3OXH4ZPM65"
    "ap-southeast-3" = "Z08888821HLRG5A9ZRTER"
    "ap-southeast-4" = "Z09517862IB2WZLPXG76F"
    "ca-central-1"   = "ZQSVJUPU6J1EY"
    "ca-west-1"      = "Z06473681YS74MMRMAMGT"
    "cn-north-1"     = "Z1GDH35T77C1KE"
    "cn-northwest-1" = "ZM7IZAIOVVDZF"
    "eu-central-1"   = "Z215JYRZR1TBD5"
    "eu-central-2"   = "Z06391101F2ZOEP8P5EB3"
    "eu-north-1"     = "Z23TAZ6LKFMNIO"
    "eu-south-1"     = "Z3ULH7SSC945YB"
    "eu-south-2"     = "Z0956581394HF5D5LXGAP"
    "eu-west-1"      = "Z32O12XQLNTSW2"
    "eu-west-2"      = "ZHURV8PSTC4K8"
    "eu-west-3"      = "Z3Q77PNBQS71R4"
    "il-central-1"   = "Z09170902867EHPV2DABU"
    "me-central-1"   = "Z08230872XQRWHG2XF6I"
    "me-south-1"     = "ZS929ML54UICD"
    "sa-east-1"      = "Z2P70J7HTTTPLU"
    "us-east-1"      = "Z35SXDOTRQ7X7K"
    "us-east-2"      = "Z3AADJGX6KTTL2"
    "us-gov-east-1"  = "Z166TLBEWOO7G0"
    "us-gov-west-1"  = "Z33AYJ8TM3BH4J"
    "us-west-1"      = "Z368ELLRRE2KJ0"
    "us-west-2"      = "Z1H1FL5HABSF5"
  }

  api_alb_zone_id = local.alb_zone_ids[var.region]
}

resource "aws_route53_record" "api_alias" {
  count = local.dns_zone_available && var.helm_api_alb_hostname != "" ? 1 : 0

  zone_id = local.effective_zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = var.helm_api_alb_hostname
    zone_id                = local.api_alb_zone_id
    evaluate_target_health = true
  }
}
