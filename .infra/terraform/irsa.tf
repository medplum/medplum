data "aws_eks_cluster" "feature_staging" {
  name = "tm-feature-staging"
}

#data block for getting details regarding eks_cluster
data "aws_eks_cluster" "demo" {
  name = "tm-demo"
}

locals {
  feature_staging_eks_oidc_issuer = trimprefix(data.aws_eks_cluster.feature_staging.identity[0].oidc[0].issuer, "https://")
  demo_eks_oidc_issuer            = trimprefix(data.aws_eks_cluster.demo.identity[0].oidc[0].issuer, "https://")
}

# data block to define the trust relationship for the IAM role that k8 service account will leverage
data "aws_iam_policy_document" "oidc_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "${local.feature_staging_eks_oidc_issuer}:sub"
      values   = ["system:serviceaccount:${var.environment}:medplum-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.feature_staging_eks_oidc_issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }

    principals {
      identifiers = ["arn:aws:iam::${var.aws_account}:oidc-provider/${local.feature_staging_eks_oidc_issuer}"]
      type        = "Federated"
    }
  }
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "${local.demo_eks_oidc_issuer}:sub"
      values   = ["system:serviceaccount:${var.environment}:medplum-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.demo_eks_oidc_issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }

    principals {
      identifiers = ["arn:aws:iam::${var.aws_account}:oidc-provider/${local.demo_eks_oidc_issuer}"]
      type        = "Federated"
    }
  }
}

#resource block for degineing the IAM role that K8 service will use
resource "aws_iam_role" "IAM-role" {
  name = "K8-ServiceAccount-IAMRole-medplum"

  assume_role_policy = data.aws_iam_policy_document.oidc_assume_role_policy.json
}

# resource block for defining the IAM  policy  for rds access that is tied to the IAM role
data "aws_iam_policy_document" "iam_policy_demo_rds" {
  statement {
    sid    = "Stmt1679439991987"
    effect = "Allow"
    resources = [
      "arn:aws:rds:us-east-2:969158125505:db:medplum-core-nonprod",
      "arn:aws:rds:us-east-2:347383665746:snapshot:*",
    ]
    actions = ["rds:*"]
  }
}

# resource "aws_iam_policy" "iam_policy_rds" {
#   name   = "Demo-Medplum-Rds"
#   policy = data.aws_iam_policy_document.iam_policy_demo_rds.json
# }

# # resource to attach the IAM policy for RDS to IAM role
# resource "aws_iam_role_policy_attachment" "attach_rds_policy" {
#   role       = aws_iam_role.IAM-role.id
#   policy_arn = aws_iam_policy.iam_policy_rds.arn
# }

resource "vault_policy" "policy" {
  name   = "vault_single_medplum_${var.environment}"
  policy = var.vault_policy
}

resource "vault_kubernetes_auth_backend_role" "role" {
  backend                          = "kubernetes-service"
  role_name                        = var.vault_kubernetes_auth_role_name
  bound_service_account_names      = [var.vault_auth_bound_service_account]
  bound_service_account_namespaces = [var.vault_auth_namespace]
  token_ttl                        = 86400
  token_policies                   = [vault_policy.policy.name]
}