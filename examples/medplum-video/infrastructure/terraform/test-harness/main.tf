terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.40"
    }
  }

  # Re-uses the same remote state bucket / lock table as the livekit module.
  # Only the key differs, so `make bootstrap` (run once for the livekit module)
  # provisions the backend for both.
  backend "s3" {
    bucket         = "medplum-tf-state-dev"
    key            = "medplum-video/test-harness/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "medplum-dev-tf-state-lock"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile != "" ? var.aws_profile : null

  # default_tags intentionally omitted: IAM CreateRole/TagRole are often
  # separate permissions in SSO roles.  Tags are applied explicitly per
  # resource via local.common_tags instead.
}

# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Shared infrastructure from the livekit module
#
# The test-harness is intentionally thin - it re-uses the VPC, public subnets,
# and ECS cluster that were created by `terraform/livekit`.  This avoids VPC
# quota exhaustion (default AWS limit is 5 per region) and keeps a single set
# of networking artefacts per environment.
# ---------------------------------------------------------------------------

data "terraform_remote_state" "livekit" {
  backend = "s3"
  config = {
    bucket       = "medplum-tf-state-dev"
    key          = "medplum-video/livekit/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
    profile      = var.aws_profile != "" ? var.aws_profile : null
  }
}
