variable "location" {
  default = "eastus"
}

variable "resource-group-name" {
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

variable "resource_naming_prefix" {
  type    = string
  default = "medplum"
}