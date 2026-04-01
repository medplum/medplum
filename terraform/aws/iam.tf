data "aws_iam_policy_document" "server_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:medplum:medplum"]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = "${local.name_prefix}-server-role"
  description        = "IRSA role for the Medplum server pod (namespace: medplum)"
  assume_role_policy = data.aws_iam_policy_document.server_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "server_policy" {
  statement {
    sid    = "SSMParameterStore"
    effect = "Allow"
    actions = [
      "ssm:GetParametersByPath",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:DescribeParameters",
    ]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${local.name_prefix}",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${local.name_prefix}/*",
    ]
  }

  statement {
    sid    = "SecretsManager"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      aws_secretsmanager_secret.medplum.arn,
      aws_secretsmanager_secret.db_config.arn,
      module.aurora.cluster_master_user_secret[0].secret_arn,
    ]
  }

  statement {
    sid    = "KMS"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [
      aws_kms_key.medplum.arn,
    ]
  }

  statement {
    sid    = "S3AppBucket"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = concat(
      [aws_s3_bucket.app.arn, "${aws_s3_bucket.app.arn}/*"],
      local.storage_cdn_enabled ? [aws_s3_bucket.storage[0].arn, "${aws_s3_bucket.storage[0].arn}/*"] : []
    )
  }

  statement {
    sid    = "SES"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = [
      "arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/${local.ses_domain}",
      "arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/${var.support_email}",
    ]
  }

  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:InvokeFunction",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:medplum-bot-*",
    ]
  }

  statement {
    sid    = "LambdaLayers"
    effect = "Allow"
    actions = [
      "lambda:ListLayerVersions",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:layer:medplum-bot-layer",
    ]
  }

  statement {
    sid    = "LambdaLayerVersions"
    effect = "Allow"
    actions = [
      "lambda:GetLayerVersion",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:layer:medplum-bot-layer:*",
    ]
  }

  statement {
    sid    = "IAMBotRole"
    effect = "Allow"
    actions = [
      "iam:ListRoles",
      "iam:GetRole",
      "iam:PassRole",
    ]
    resources = [local.effective_bot_lambda_role_arn]
  }

  statement {
    sid    = "XRay"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
      "xray:GetSamplingStatisticSummaries",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ComprehendTextract"
    effect = "Allow"
    actions = [
      "comprehend:DetectEntities",
      "comprehend:DetectKeyPhrases",
      "comprehend:DetectDominantLanguage",
      "comprehend:DetectSentiment",
      "comprehend:DetectTargetedSentiment",
      "comprehend:DetectSyntax",
      "comprehendmedical:DetectEntitiesV2",
      "textract:DetectDocumentText",
      "textract:AnalyzeDocument",
      "textract:StartDocumentTextDetection",
      "textract:GetDocumentTextDetection",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "server" {
  name   = "${local.name_prefix}-server-policy"
  policy = data.aws_iam_policy_document.server_policy.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "server" {
  role       = aws_iam_role.server.name
  policy_arn = aws_iam_policy.server.arn
}

# AWS Load Balancer Controller IAM role and policy
# Enables the controller to provision and manage ALBs for Kubernetes Ingress resources

data "aws_iam_policy_document" "lb_controller_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lb_controller" {
  name               = "${local.name_prefix}-lb-controller-role"
  description        = "IRSA role for the AWS Load Balancer Controller (kube-system)"
  assume_role_policy = data.aws_iam_policy_document.lb_controller_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "lb_controller_policy" {
  statement {
    sid    = "LBControllerFull"
    effect = "Allow"
    actions = [
      "elasticloadbalancing:*",
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:RevokeSecurityGroupIngress",
      "ec2:CreateSecurityGroup",
      "ec2:DeleteSecurityGroup",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSecurityGroupRules",
      "ec2:CreateTags",
      "ec2:DeleteTags",
      "ec2:DescribeTags",
      "ec2:DescribeInstances",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSubnets",
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeVpcs",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeCoipPools",
      "ec2:GetCoipPoolUsage",
      "ec2:GetManagedPrefixListEntries",
      "ec2:DescribePrefixLists",
      "ec2:DescribeAddresses",
      "ec2:DescribeAddressesAttribute",
      "iam:CreateServiceLinkedRole",
      "iam:GetServiceLinkedRoleDeletionStatus",
      "cognito-idp:DescribeUserPoolClient",
      "wafv2:AssociateWebACL",
      "wafv2:DisassociateWebACL",
      "wafv2:GetWebACL",
      "wafv2:GetWebACLForResource",
      "waf-regional:GetWebACLForResource",
      "waf-regional:GetWebACL",
      "waf-regional:AssociateWebACL",
      "waf-regional:DisassociateWebACL",
      "shield:DescribeProtection",
      "shield:GetSubscriptionState",
      "shield:DescribeSubscription",
      "shield:ListProtections",
      "acm:DescribeCertificate",
      "acm:ListCertificates",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "lb_controller" {
  name   = "${local.name_prefix}-lb-controller-policy"
  policy = data.aws_iam_policy_document.lb_controller_policy.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lb_controller" {
  role       = aws_iam_role.lb_controller.name
  policy_arn = aws_iam_policy.lb_controller.arn
}

# Bot Lambda execution role
resource "aws_iam_role" "bot_lambda" {
  name        = "${local.name_prefix}-bot-lambda-role"
  description = "Execution role for Medplum bot Lambda functions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "bot_lambda_basic" {
  role       = aws_iam_role.bot_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CloudTrail → CloudWatch Logs delivery role
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

# VPC Flow Logs → CloudWatch delivery role
resource "aws_iam_role" "vpc_flow_logs" {
  name = "${local.name_prefix}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "vpc-flow-logs.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  name = "${local.name_prefix}-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs.id

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
        Resource = "${aws_cloudwatch_log_group.vpc_flow_logs.arn}:*"
      }
    ]
  })
}

# RDS Proxy execution role
resource "aws_iam_role" "rds_proxy" {
  count = var.rds_proxy_enabled ? 1 : 0
  name  = "${local.name_prefix}-rds-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "rds_proxy" {
  count = var.rds_proxy_enabled ? 1 : 0
  name  = "${local.name_prefix}-rds-proxy-policy"
  role  = aws_iam_role.rds_proxy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [module.aurora.cluster_master_user_secret[0].secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.medplum.arn]
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
        }
      }
    ]
  })
}
