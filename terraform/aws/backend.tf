# ── Terraform remote state bootstrap ─────────────────────────────────────────
#
# This file creates the S3 bucket and DynamoDB table needed for remote state
# storage. Because these resources must exist *before* the S3 backend can be
# configured, a two-phase bootstrap is required:
#
#   Phase 1 — create the state backend resources with local state:
#     terraform init
#     terraform apply -target=aws_s3_bucket.tfstate \
#                     -target=aws_s3_bucket_versioning.tfstate \
#                     -target=aws_s3_bucket_server_side_encryption_configuration.tfstate \
#                     -target=aws_s3_bucket_public_access_block.tfstate \
#                     -target=aws_dynamodb_table.tfstate_lock
#
#   Phase 2 — copy the backend block below into versions.tf, then migrate:
#     terraform init -migrate-state
#     # Confirm "yes" to migrate the local state to S3.
#
#   All subsequent terraform init / plan / apply commands will use S3 state.
#
# ─────────────────────────────────────────────────────────────────────────────
#
# Backend block to add to versions.tf after Phase 1 completes:
#
#   terraform {
#     backend "s3" {
#       bucket         = "<value of output: tfstate_bucket_name>"
#       key            = "terraform.tfstate"
#       region         = "<your AWS region>"
#       encrypt        = true
#       kms_key_id     = "<value of output: tfstate_kms_key_id>"
#       dynamodb_table = "<value of output: tfstate_lock_table_name>"
#     }
#   }
#
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "tfstate" {
  bucket = "${local.name_prefix}-tfstate-${data.aws_caller_identity.current.account_id}"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}-tfstate"
    Purpose = "terraform-state"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.medplum.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days           = 90
      newer_noncurrent_versions = 10
    }
  }
}

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "${local.name_prefix}-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.medplum.arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}-tfstate-lock"
    Purpose = "terraform-state-lock"
  })

  lifecycle {
    prevent_destroy = true
  }
}
