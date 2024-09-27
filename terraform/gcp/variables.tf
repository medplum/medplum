variable "region" {
  description = "The GCP region where resources will be created."
  type        = string
}
variable "zone" {
  description = "The GCP zone where resources will be created."
  type        = string

}
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}
variable "services_api" {
  description = "A list of GCP services to enable"
  type        = list(string)
}
variable "labels" {
  description = "A map of common enforced labels"
  type        = map(string)
  default = {
    env     = ""
    purpose = ""
    owner   = ""
  }
}

# VPC
variable "vpc_name" {
  description = "The name for the VPC"
}

## Postgres
variable "pg_ha_name" {
  description = "The name for the HA Postgres instance"
  type        = string
}

# Private Service
variable "psa_range_name" {
  description = "name of the private allocated range"
  type        = string
  default     = "priv-ip-alloc"
}

variable "psa_range" {
  description = "First IP address of the IP range to allocate to CLoud SQL instances and other Private Service Access services. If not set, GCP will pick a valid one for you."
  type        = string
  default     = ""
}
