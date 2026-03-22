output "state_bucket_name" {
  description = "Name of the S3 bucket created to store Terraform state"
  value       = aws_s3_bucket.tf_state.id
}

output "state_lock_table_name" {
  description = "Name of the DynamoDB table used for Terraform state locking"
  value       = aws_dynamodb_table.tf_state_lock.id
}

output "region" {
  description = "AWS region where the bootstrap resources were created — use this in backend.tf"
  value       = data.aws_region.current.name
}
