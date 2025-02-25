locals {
  resource_prefix     = "${var.project}-${var.environment}"
  account_name_prefix = "${var.project}${var.environment}"
  kv_prefix           = "${var.project}${var.environment}"
}