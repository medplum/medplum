# WAFv2 Web ACLs — mirrors CDK's buildWaf() applied to ALB, app CloudFront, and storage CloudFront.
#
# CloudFront WAFs (scope = CLOUDFRONT) MUST be created in us-east-1.
# This file uses the aws.us_east_1 provider alias defined in versions.tf for those resources.
# The regional WAF (scope = REGIONAL) uses the default provider for the deployment region.

# ─── App CloudFront WAF (us-east-1) ──────────────────────────────────────────

resource "aws_wafv2_web_acl" "app" {
  count    = var.enable_waf ? 1 : 0
  provider = aws.us_east_1

  name        = "${local.name_prefix}-app-waf"
  description = "WAF for Medplum app CloudFront distribution"
  scope       = "CLOUDFRONT"

  dynamic "default_action" {
    for_each = [1]
    content {
      dynamic "allow" {
        for_each = var.app_waf_ip_set_arn == "" ? [1] : []
        content {}
      }
      dynamic "block" {
        for_each = var.app_waf_ip_set_arn != "" ? [1] : []
        content {}
      }
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      count {}
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

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 2

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-app-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-app-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesLinuxRuleSet"
    priority = 4

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesLinuxRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-app-linux"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.app_waf_ip_set_arn != "" ? [1] : []
    content {
      name = "IPAllowList"
      # Priority 5: allowlisted IPs are evaluated after managed rule groups (priorities 1–4)
      # and will bypass them entirely on an Allow match. Trusted IPs skip managed rules to avoid false positives.
      priority = 5

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

  dynamic "default_action" {
    for_each = [1]
    content {
      dynamic "allow" {
        for_each = var.storage_waf_ip_set_arn == "" ? [1] : []
        content {}
      }
      dynamic "block" {
        for_each = var.storage_waf_ip_set_arn != "" ? [1] : []
        content {}
      }
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      count {}
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

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 2

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-storage-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-storage-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesLinuxRuleSet"
    priority = 4

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesLinuxRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-storage-linux"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.storage_waf_ip_set_arn != "" ? [1] : []
    content {
      name = "IPAllowList"
      # Priority 5: allowlisted IPs bypass managed rule groups (priorities 1–4). See app WAF comment.
      priority = 5

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

  dynamic "default_action" {
    for_each = [1]
    content {
      dynamic "allow" {
        for_each = var.api_waf_ip_set_arn == "" ? [1] : []
        content {}
      }
      dynamic "block" {
        for_each = var.api_waf_ip_set_arn != "" ? [1] : []
        content {}
      }
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      count {}
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

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 2

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesLinuxRuleSet"
    priority = 4

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesLinuxRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-linux"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.api_waf_ip_set_arn != "" ? [1] : []
    content {
      name = "IPAllowList"
      # Priority 5: allowlisted IPs bypass managed rule groups (priorities 1–4). See app WAF comment.
      priority = 5

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

# ─── WAF Logging (optional) ───────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "waf_app" {
  count             = var.enable_waf && var.waf_logging_enabled ? 1 : 0
  provider          = aws.us_east_1
  name              = "aws-waf-logs-${local.name_prefix}-app"
  retention_in_days = var.environment == "prod" ? 365 : 90
  tags              = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "app" {
  count                   = var.enable_waf && var.waf_logging_enabled ? 1 : 0
  provider                = aws.us_east_1
  log_destination_configs = [aws_cloudwatch_log_group.waf_app[0].arn]
  resource_arn            = aws_wafv2_web_acl.app[0].arn
}

resource "aws_cloudwatch_log_group" "waf_storage" {
  count             = var.enable_waf && var.waf_logging_enabled && local.storage_cdn_enabled ? 1 : 0
  provider          = aws.us_east_1
  name              = "aws-waf-logs-${local.name_prefix}-storage"
  retention_in_days = var.environment == "prod" ? 365 : 90
  tags              = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "storage" {
  count                   = var.enable_waf && var.waf_logging_enabled && local.storage_cdn_enabled ? 1 : 0
  provider                = aws.us_east_1
  log_destination_configs = [aws_cloudwatch_log_group.waf_storage[0].arn]
  resource_arn            = aws_wafv2_web_acl.storage[0].arn
}

resource "aws_cloudwatch_log_group" "waf_api" {
  count             = var.enable_waf && var.waf_logging_enabled ? 1 : 0
  name              = "aws-waf-logs-${local.name_prefix}-api"
  retention_in_days = var.environment == "prod" ? 365 : 90
  tags              = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "api" {
  count                   = var.enable_waf && var.waf_logging_enabled ? 1 : 0
  log_destination_configs = [aws_cloudwatch_log_group.waf_api[0].arn]
  resource_arn            = aws_wafv2_web_acl.api[0].arn
}

# Associate the regional WAF with the ALB.
# The ALB ARN is only known after EKS Ingress is provisioned; supply waf_alb_arn on a second apply.
resource "aws_wafv2_web_acl_association" "api" {
  count = var.enable_waf && var.waf_alb_arn != "" ? 1 : 0

  resource_arn = var.waf_alb_arn
  web_acl_arn  = aws_wafv2_web_acl.api[0].arn
}
