variable "region" {
  description = "The GCP region where resources will be created."
  type        = string
  default     = "us-west1"
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
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

# Subnets VPC
variable "subnets" {
  type        = list(map(string))
  description = "The list of subnets being created"
}

variable "secondary_ranges" {
  type        = map(list(object({ range_name = string, ip_cidr_range = string })))
  description = "Secondary ranges that will be used in some of the subnets"
  default     = {}
}