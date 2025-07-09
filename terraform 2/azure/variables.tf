variable "location" {
  default = "eastus"
}

variable "resource_group_name" {
  type    = string
  default = null
}

variable "tags" {
  type    = map(string)
  default = null
}

variable "managed_identity_principal_id" {
  type    = string
  default = null
}

variable "app_domain" {
  type    = string
  default = null
}

variable "app_certificate_secret_id" {
  description = "The ID of the Key Vault certificate secret"
  type        = string
  default     = null
}

variable "environment" {
  description = "values: dev, test, prod"
  type        = string
  default     = "dev"
}

variable "deployment_id" {
  description = "The deployment ID for the current deployment"
  type        = string
  default     = "1"
}