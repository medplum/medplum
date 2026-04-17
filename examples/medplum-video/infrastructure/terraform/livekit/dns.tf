# ---------------------------------------------------------------------------
# ACM Certificate  (DNS validation)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "livekit" {
  domain_name       = local.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Create the validation CNAME records in the user-supplied Hosted Zone.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.livekit.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "livekit" {
  certificate_arn         = aws_acm_certificate.livekit.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# Route53 A Alias  →  NLB
# Single record covers all ports; the NLB's listeners handle port routing.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "livekit" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.livekit.dns_name
    zone_id                = aws_lb.livekit.zone_id
    evaluate_target_health = true
  }
}
