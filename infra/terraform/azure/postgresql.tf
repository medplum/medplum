# Azure PostgreSQL Flexible Server configuration for Medplum.
# Sets up a private PostgreSQL instance with:
# - Private DNS zone for internal access
# - Required PostgreSQL extensions
# - Azure AD and password authentication
# - Production-ready defaults

resource "azurerm_private_dns_zone" "db" {
  name                = "db.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
  depends_on          = [azurerm_resource_group.rg]
}

resource "azurerm_private_dns_zone_virtual_network_link" "db" {
  name                  = "${local.resource_prefix}-db-vnet-link"
  private_dns_zone_name = azurerm_private_dns_zone.db.name
  resource_group_name   = azurerm_resource_group.rg.name
  virtual_network_id    = azurerm_virtual_network.server_vnet.id
}

resource "random_password" "postgresql_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "azurerm_postgresql_flexible_server" "db" {
  name                = "${local.resource_prefix}-db"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name

  # Network settings
  delegated_subnet_id           = azurerm_subnet.medplum_db_snet_01.id
  private_dns_zone_id           = azurerm_private_dns_zone.db.id
  public_network_access_enabled = true

  # Performance settings
  sku_name          = var.postgresql_sku_name
  storage_mb        = var.postgresql_storage_mb
  version           = "15"
  auto_grow_enabled = true

  # Backup settings
  backup_retention_days        = var.postgresql_backup_retention_days
  geo_redundant_backup_enabled = var.postgresql_geo_redundant_backup

  # Authentication
  administrator_login    = "medplumadmin"
  administrator_password = random_password.postgresql_password.result
  authentication {
    password_auth_enabled         = true
    active_directory_auth_enabled = true
    tenant_id                     = data.azurerm_client_config.current.tenant_id
  }

  lifecycle {
    ignore_changes = [
      zone,
      high_availability[0].standby_availability_zone
    ]
  }

  depends_on = [azurerm_resource_group.rg]
}

# Required Medplum extensions
resource "azurerm_postgresql_flexible_server_configuration" "azure_extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "pg_stat_statements,btree_gin,pg_trgm"
}

# SSL configuration
resource "azurerm_postgresql_flexible_server_configuration" "require_secure_transport" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "off"
}

output "postgresql_password" {
  value     = random_password.postgresql_password.result
  sensitive = true
}

output "postgresql_fqdn" {
  description = "PostgreSQL server fully qualified domain name"
  value       = format("%s.postgres.database.azure.com", azurerm_postgresql_flexible_server.db.name)
}