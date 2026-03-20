# CloudTrail + CloudWatch metric alarms — mirrors CDK's CloudTrailAlarms construct.
# Enabled via var.enable_cloudtrail_alarms (default: false to keep non-prod costs low).
#
# The 10 alarm definitions below exactly match CDK's cloudtrail.ts alarm list.

resource "aws_cloudwatch_log_group" "cloudtrail" {
  count             = var.enable_cloudtrail_alarms ? 1 : 0
  name              = "/medplum/cloudtrail/${local.name_prefix}"
  retention_in_days = var.environment == "prod" ? 365 : 90

  tags = var.tags
}

resource "aws_iam_role" "cloudtrail_cw" {
  count = var.enable_cloudtrail_alarms ? 1 : 0
  name  = "${local.name_prefix}-cloudtrail-cw-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "cloudtrail_cw" {
  count = var.enable_cloudtrail_alarms ? 1 : 0
  name  = "${local.name_prefix}-cloudtrail-cw-policy"
  role  = aws_iam_role.cloudtrail_cw[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
      }
    ]
  })
}

resource "aws_cloudtrail" "medplum" {
  count = var.enable_cloudtrail_alarms ? 1 : 0
  name  = "${local.name_prefix}-trail"

  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs[0].id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cw[0].arn

  tags = var.tags

  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]
}

# S3 bucket for CloudTrail raw log delivery (required by aws_cloudtrail)
resource "aws_s3_bucket" "cloudtrail_logs" {
  count         = var.enable_cloudtrail_alarms ? 1 : 0
  bucket        = "${local.name_prefix}-cloudtrail-logs"
  force_destroy = var.environment != "prod"
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  count  = var.enable_cloudtrail_alarms ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  count  = var.enable_cloudtrail_alarms ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs[0].arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.cloudtrail_logs]
}

# SNS topic for alarm notifications
resource "aws_sns_topic" "cloudtrail_alarms" {
  count = var.enable_cloudtrail_alarms ? 1 : 0
  name  = "${local.name_prefix}-cloudtrail-alarms"
  tags  = var.tags
}

resource "aws_sns_topic_subscription" "cloudtrail_alarms_email" {
  count     = var.enable_cloudtrail_alarms && var.cloudtrail_alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.cloudtrail_alarms[0].arn
  protocol  = "email"
  endpoint  = var.cloudtrail_alarm_email
}

# ─── Metric filters + alarms (10 CDK-parity patterns) ────────────────────────

locals {
  cloudtrail_alarms = var.enable_cloudtrail_alarms ? {
    UnauthorizedApiCalls = {
      pattern     = "{ ($.errorCode = *UnauthorizedOperation) || ($.errorCode = AccessDenied*) }"
      description = "Unauthorized API calls detected"
    }
    SignInWithoutMfa = {
      pattern     = "{ ($.eventName = ConsoleLogin) && ($.additionalEventData.MFAUsed != Yes) }"
      description = "AWS Console sign-in without MFA"
    }
    RootAccountUsage = {
      pattern     = "{ $.userIdentity.type = Root && $.userIdentity.invokedBy NOT EXISTS && $.eventType != AwsServiceEvent }"
      description = "Root account usage detected"
    }
    IamPolicyChanges = {
      pattern     = "{($.eventName=DeleteGroupPolicy)||($.eventName=DeleteRolePolicy)||($.eventName=DeleteUserPolicy)||($.eventName=PutGroupPolicy)||($.eventName=PutRolePolicy)||($.eventName=PutUserPolicy)||($.eventName=CreatePolicy)||($.eventName=DeletePolicy)||($.eventName=CreatePolicyVersion)||($.eventName=DeletePolicyVersion)||($.eventName=AttachRolePolicy)||($.eventName=DetachRolePolicy)||($.eventName=AttachUserPolicy)||($.eventName=DetachUserPolicy)||($.eventName=AttachGroupPolicy)||($.eventName=DetachGroupPolicy)}"
      description = "IAM policy changes detected"
    }
    CloudTrailConfigurationChanges = {
      pattern     = "{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }"
      description = "CloudTrail configuration changes"
    }
    SignInFailures = {
      pattern     = "{ ($.eventName = ConsoleLogin) && ($.errorMessage = \"Failed authentication\") }"
      description = "AWS Console sign-in failures"
    }
    DisabledCmks = {
      pattern     = "{($.eventSource = kms.amazonaws.com) && (($.eventName=DisableKey)||($.eventName=ScheduleKeyDeletion))}"
      description = "Customer-managed KMS key disabled or scheduled for deletion"
    }
    S3PolicyChanges = {
      pattern     = "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) || ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) || ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) || ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }"
      description = "S3 bucket policy changes"
    }
    ConfigServiceChanges = {
      pattern     = "{($.eventSource = config.amazonaws.com) && (($.eventName=StopConfigurationRecorder)||($.eventName=DeleteDeliveryChannel)||($.eventName=PutDeliveryChannel)||($.eventName=PutConfigurationRecorder))}"
      description = "AWS Config service changes"
    }
    SecurityGroupChanges = {
      pattern     = "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }"
      description = "Security group changes detected"
    }
  } : {}
}

resource "aws_cloudwatch_log_metric_filter" "cloudtrail" {
  for_each = local.cloudtrail_alarms

  name           = "${local.name_prefix}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = each.value.pattern

  metric_transformation {
    name      = each.key
    namespace = "MedplumCloudTrailMetrics/${local.name_prefix}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudtrail" {
  for_each = local.cloudtrail_alarms

  alarm_name          = "${local.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.key
  namespace           = "MedplumCloudTrailMetrics/${local.name_prefix}"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.cloudtrail_alarms[0].arn]
  ok_actions    = [aws_sns_topic.cloudtrail_alarms[0].arn]

  tags = var.tags
}
