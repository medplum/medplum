variable "region" {
  description = "AWS region in which to create the Terraform state bucket and lock table."
  type        = string
  default     = "us-east-1"
}
