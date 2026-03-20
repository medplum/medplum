# ACM certificate management — automatic when cert ARN variables are left empty
# and Route 53 is available (create_route53_zone or create_route53_records = true).
#
# Three certs are managed:
#   app     — CloudFront cert for var.app_domain         (must be in us-east-1)
#   alb     — ALB cert for var.api_domain                (deployment region)
#   storage — CloudFront cert for var.storage_domain     (must be in us-east-1, when storage CDN enabled)
#
# Providing a cert ARN in variables.tf skips creation of that cert entirely,
# letting you reuse existing certificates without disrupting them.

# ── App CloudFront certificate (us-east-1) ────────────────────────────────────

resource "aws_acm_certificate" "app" {
  count    = local.manage_app_cert ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.app_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "cert_validation_app" {
  count = local.manage_app_cert ? 1 : 0

  zone_id         = local.effective_zone_id
  name            = tolist(aws_acm_certificate.app[0].domain_validation_options)[0].resource_record_name
  type            = tolist(aws_acm_certificate.app[0].domain_validation_options)[0].resource_record_type
  ttl             = 60
  records         = [tolist(aws_acm_certificate.app[0].domain_validation_options)[0].resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  count    = local.manage_app_cert ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation_app[0].fqdn]
}

# ── ALB certificate (deployment region) ──────────────────────────────────────

resource "aws_acm_certificate" "alb" {
  count = local.manage_alb_cert ? 1 : 0

  domain_name       = var.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "cert_validation_alb" {
  count = local.manage_alb_cert ? 1 : 0

  zone_id         = local.effective_zone_id
  name            = tolist(aws_acm_certificate.alb[0].domain_validation_options)[0].resource_record_name
  type            = tolist(aws_acm_certificate.alb[0].domain_validation_options)[0].resource_record_type
  ttl             = 60
  records         = [tolist(aws_acm_certificate.alb[0].domain_validation_options)[0].resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "alb" {
  count = local.manage_alb_cert ? 1 : 0

  certificate_arn         = aws_acm_certificate.alb[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation_alb[0].fqdn]
}

# ── Storage CloudFront certificate (us-east-1) ────────────────────────────────

resource "aws_acm_certificate" "storage" {
  count    = local.manage_storage_cert ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.storage_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "cert_validation_storage" {
  count = local.manage_storage_cert ? 1 : 0

  zone_id         = local.effective_zone_id
  name            = tolist(aws_acm_certificate.storage[0].domain_validation_options)[0].resource_record_name
  type            = tolist(aws_acm_certificate.storage[0].domain_validation_options)[0].resource_record_type
  ttl             = 60
  records         = [tolist(aws_acm_certificate.storage[0].domain_validation_options)[0].resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "storage" {
  count    = local.manage_storage_cert ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.storage[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation_storage[0].fqdn]
}
