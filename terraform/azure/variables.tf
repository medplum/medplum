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
  type    = string
  default = null
}
