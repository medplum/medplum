variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "medplum"
}

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

# variable "app_certificate_secret_id" {
#   type    = string
#   default = null
# }

variable "vnet_address_space" {
  description = "Address space for the Virtual Network"
  type        = list(string)
  default     = ["10.52.0.0/16"]
}

variable "subnet_prefixes" {
  description = "Address prefixes for subnets"
  type        = map(string)
  default = {
    aks_nodes = "10.52.1.0/24"
    aks_pods  = "10.52.200.0/22"
    appgw     = "10.52.0.0/24"
    db        = "10.52.4.0/24"
    redis     = "10.52.6.0/24"
  }
}

variable "service_cidr" {
  description = "CIDR for Kubernetes Services"
  type        = string
  default     = "10.52.8.0/24"
}

variable "dns_service_ip" {
  description = "IP address for Kubernetes DNS inside the service_cidr"
  type        = string
  default     = "10.52.8.10"
}

variable "postgresql_sku_name" {
  description = "SKU name for PostgreSQL server"
  type        = string
  default     = "GP_Standard_D2s_v3" # Production-ready default
}

variable "postgresql_storage_mb" {
  description = "Storage size in MB for PostgreSQL server"
  type        = number
  default     = 65536 # 64GB
}

variable "postgresql_backup_retention_days" {
  description = "Backup retention days for PostgreSQL server"
  type        = number
  default     = 30
}

variable "postgresql_geo_redundant_backup" {
  description = "Enable geo-redundant backups"
  type        = bool
  default     = false
}

variable "redis_capacity" {
  description = "Redis cache capacity in GB"
  type        = number
  default     = 2 # 2GB default
}

variable "redis_family" {
  description = "Redis cache family (C for Standard/Basic, P for Premium)"
  type        = string
  default     = "C"
}

variable "redis_sku_name" {
  description = "Redis cache SKU (Basic, Standard, Premium)"
  type        = string
  default     = "Standard"
}

variable "storage_account_tier" {
  description = "Storage account tier (Standard or Premium)"
  type        = string
  default     = "Standard"
}

variable "storage_replication_type" {
  description = "Storage replication type (LRS, GRS, RAGRS, ZRS)"
  type        = string
  default     = "GRS" # Changed from LRS for better data protection
}

variable "storage_allowed_origins" {
  description = "Allowed origins for CORS"
  type        = list(string)
  default     = ["*"] # Should be restricted in production
}

output "storage_account_name" {
  description = "Storage account name for configuration"
  value       = azurerm_storage_account.frontend_account.name
}

output "storage_account_key" {
  description = "Primary access key for storage account"
  value       = azurerm_storage_account.frontend_account.primary_access_key
  sensitive   = true
}

variable "aks_node_size" {
  description = "The size of the AKS nodes (e.g., Standard_D2_v2, Standard_D4_v2)"
  type        = string
  default     = "Standard_D2_v2"
}

variable "aks_node_count" {
  description = "The number of nodes in the AKS cluster"
  type        = number
  default     = 1
}

variable "aks_default_pool_name" {
  description = "The name of the default node pool"
  type        = string
  default     = "default"
}