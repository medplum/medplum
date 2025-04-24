locals {
  default_aws_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "medplum"
    Contact     = "slack/eng-infra-support"
    Team        = "infra-dx"
    Repo        = "https://github.com/ThirtyMadison/medplum"

    Confidentiality = "sensitive" # https://go-links.fortymadison.com/data-classification-policy
  }
}

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.10"
    }
    vault = {
      source  = "hashicorp/vault"
      version = ">= 3.0"
    }
  }

  backend "s3" {
    key     = "medplum.tfstate"
    region  = "us-east-2"
    encrypt = true
  }
}

provider "vault" {
  address = var.vault_address
  auth_login {
    path = "auth/github/login"

    parameters = {
      token = var.vault_auth_token
    }
  }
}

provider "aws" {
  region = "us-east-2"

  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account}:role/TerraformDeployRole"
  }

  default_tags { tags = local.default_aws_tags }
}

provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"

  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account}:role/TerraformDeployRole"
  }

  default_tags { tags = local.default_aws_tags }
}

# tflint-ignore: terraform_unused_declarations
data "aws_region" "current" {}
# tflint-ignore: terraform_unused_declarations
data "aws_caller_identity" "current" {}
# tflint-ignore: terraform_unused_declarations
data "aws_availability_zones" "available" {
  state = "available" # Only Availability Zones (no Local Zones)

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}