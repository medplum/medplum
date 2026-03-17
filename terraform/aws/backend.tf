# Remote State Backend Configuration
#
# PREREQUISITE: The S3 bucket and DynamoDB table below must exist BEFORE
# running `terraform init` with this backend enabled. Use the bootstrap module
# at terraform/aws/bootstrap/ to create them:
#
#   cd terraform/aws/bootstrap
#   terraform init
#   terraform apply
#
# After the bootstrap resources are created, replace <YOUR_ACCOUNT_ID> with
# your actual AWS account ID, uncomment the block below, then run:
#
#   cd terraform/aws
#   terraform init   # will prompt to migrate existing local state if any
#
# Required resources (created by bootstrap/main.tf):
#   S3 bucket    : medplum-tf-state-<YOUR_ACCOUNT_ID>  (versioning + KMS + public-access-block)
#   DynamoDB table: medplum-tf-state-lock               (hash key: LockID)

# terraform {
#   backend "s3" {
#     bucket         = "medplum-tf-state-<YOUR_ACCOUNT_ID>"
#     key            = "aws/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "medplum-tf-state-lock"
#     encrypt        = true
#   }
# }
