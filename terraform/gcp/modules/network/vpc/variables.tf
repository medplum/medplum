variable "project_id" {
  description = "Specify the Project ID"
  type        = string
}

variable "vpc_name" {
  description = "VPC Name"
  type        = string
}

variable "delete_default_internet_gateway_routes" {
  description = "Delete default internet gateway routes"
  default     = false
  type        = string
}
