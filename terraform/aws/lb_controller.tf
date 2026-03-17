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
