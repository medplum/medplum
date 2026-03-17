locals {
  name_prefix = "medplum-${var.environment}-${var.deployment_id}"
  ssm_prefix  = "/${local.name_prefix}"
  ses_domain  = join(".", slice(split(".", var.app_domain), length(split(".", var.app_domain)) - 2, length(split(".", var.app_domain))))
}
