terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.40"
    }
  }

  # Uncomment to store state remotely (recommended for team use):
  backend "s3" {
   bucket         = "medplum-tf-state-dev"
   key            = "medplum-video/livekit/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "medplum-dev-tf-state-lock"
  }
}

provider "aws" {
  region = var.aws_region

  # Use a named profile when supplied (via PROFILE= Makefile param or
  # AWS_PROFILE env var).  An empty string lets Terraform fall back to the
  # default credential chain.
  profile = var.aws_profile != "" ? var.aws_profile : null

  # default_tags intentionally omitted: IAM CreateRole/TagRole are often
  # separate permissions in SSO roles, and applying default_tags forces a
  # TagRole API call that may be denied.  Tags are applied explicitly per
  # resource via local.common_tags instead.
}

# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
