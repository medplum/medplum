# Route 53 DNS records — opt-in via var.create_route53_records
#
# Prerequisites: A Route 53 hosted zone must already exist in this AWS account.
# Terraform looks it up by name; it does not create it.
# Set route53_zone_name explicitly when your hosted zone is a subdomain
# (e.g. "darren-aws.foomedical.dev") rather than a root domain (e.g. "example.com").
#
# NOTE — API server record intentionally omitted:
#   The API server endpoint is a dynamic AWS Load Balancer DNS name that is only
#   known after the EKS cluster, AWS Load Balancer Controller, and Helm chart are
#   deployed. Create the API Route 53 record manually or via a separate automation
#   step once the load balancer hostname is available.

locals {
  # Effective zone name: use the explicit override if set, otherwise fall back to
  # the root domain derived from app_domain (last two segments, e.g. "example.com")
  dns_zone_name = var.route53_zone_name != "" ? var.route53_zone_name : local.ses_domain
}

data "aws_route53_zone" "main" {
  count = var.create_route53_records ? 1 : 0

  name         = "${local.dns_zone_name}."
  private_zone = false
}

# CloudFront alias record for the app domain (e.g. medplum.example.com → CloudFront)
resource "aws_route53_record" "cloudfront_alias" {
  count = var.create_route53_records ? 1 : 0

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.medplum.domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront's fixed hosted zone ID
    evaluate_target_health = false
  }
}

# SES domain TXT verification record
resource "aws_route53_record" "ses_verification" {
  count = var.create_route53_records ? 1 : 0

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "_amazonses.${local.dns_zone_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.medplum.verification_token]
}

# SES DKIM CNAME records (3 tokens)
resource "aws_route53_record" "ses_dkim" {
  count = var.create_route53_records ? 3 : 0

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "${aws_ses_domain_dkim.medplum.dkim_tokens[count.index]}._domainkey.${local.dns_zone_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.medplum.dkim_tokens[count.index]}.dkim.amazonses.com"]
}
