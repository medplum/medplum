variable "project_id" {
  description = "Specify the Project ID"
  type        = string
}

variable "region" {
  description = "region where router and NAT are deployed"
  type        = string
}

variable "nat_name" {
  description = "name of the NAT intance"
  type        = string
}

variable "router_name" {
  description = "name of the router"
  type        = string
}

variable "network_name" {
  description = "name of the network the router and NAT instance belong to"
  type        = string
}

variable "enable_dynamic_port_allocation" {
  description = "boolean flag to enable dynamic port allocation"
  type        = bool
}

variable "enable_endpoint_independent_mapping" {
  description = "boolean flag to enable endpoint independent mapping"
  type        = bool
  default     = false # Google default value
}
