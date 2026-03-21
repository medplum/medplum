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
