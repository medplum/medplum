locals {
  name_prefix = "medplum-${var.environment}-${var.deployment_id}"
  ssm_prefix  = "/${local.name_prefix}"

  # ses_domain: extracts the root domain from app_domain (last 2 segments)
  # e.g. "app.example.com" → "example.com", "app.staging.example.com" → "example.com"
  # If your hosted zone is a subdomain (e.g. "staging.example.com"), set route53_zone_name explicitly.
  ses_domain = join(".", slice(split(".", var.app_domain), length(split(".", var.app_domain)) - 2, length(split(".", var.app_domain))))
}
