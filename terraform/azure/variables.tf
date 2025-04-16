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

variable "managed-identity-principal-id" {
  type    = string
  default = null
}

variable "app-domain" {
  type    = string
  default = null
}

variable "app-certificate-secret-id" {
  description = "The ID of the Key Vault certificate secret"
  type        = string
  default     = null
}

variable "resource-naming-prefix" {
  type    = string
  default = "medplum"
}