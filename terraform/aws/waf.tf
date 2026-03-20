# WAFv2 Web ACLs — mirrors CDK's buildWaf() applied to ALB, app CloudFront, and storage CloudFront.
#
# CloudFront WAFs (scope = CLOUDFRONT) MUST be created in us-east-1.
# This file uses the aws.us_east_1 provider alias defined in versions.tf for those resources.
# The regional WAF (scope = REGIONAL) uses the default provider for the deployment region.

locals {
  waf_managed_rule_set_arn = "arn:aws:wafv2:us-east-1::managed/aws/AWSManagedRulesCommonRuleSet"
}

# ─── App CloudFront WAF (us-east-1) ──────────────────────────────────────────

resource "aws_wafv2_web_acl" "app" {
  count    = var.enable_waf ? 1 : 0
  provider = aws.us_east_1

  name        = "${local.name_prefix}-app-waf"
  description = "WAF for Medplum app CloudFront distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-app-common-rules"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.app_waf_ip_set_arn != "" ? [1] : []
    content {
      name     = "IPAllowList"
      priority = 0

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = var.app_waf_ip_set_arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-app-ip-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-app-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# ─── Storage CloudFront WAF (us-east-1) ──────────────────────────────────────

resource "aws_wafv2_web_acl" "storage" {
  count    = var.enable_waf && local.storage_cdn_enabled ? 1 : 0
  provider = aws.us_east_1

  name        = "${local.name_prefix}-storage-waf"
  description = "WAF for Medplum storage CloudFront distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-storage-common-rules"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.storage_waf_ip_set_arn != "" ? [1] : []
    content {
      name     = "IPAllowList"
      priority = 0

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = var.storage_waf_ip_set_arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-storage-ip-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-storage-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# ─── API Regional WAF (deployment region) ────────────────────────────────────

resource "aws_wafv2_web_acl" "api" {
  count = var.enable_waf ? 1 : 0

  name        = "${local.name_prefix}-api-waf"
  description = "WAF for Medplum API ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-common-rules"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.api_waf_ip_set_arn != "" ? [1] : []
    content {
      name     = "IPAllowList"
      priority = 0

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = var.api_waf_ip_set_arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-api-ip-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-api-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# Associate the regional WAF with the ALB.
# The ALB ARN is only known after EKS Ingress is provisioned; supply waf_alb_arn on a second apply.
resource "aws_wafv2_web_acl_association" "api" {
  count = var.enable_waf && var.waf_alb_arn != "" ? 1 : 0

  resource_arn = var.waf_alb_arn
  web_acl_arn  = aws_wafv2_web_acl.api[0].arn
}
