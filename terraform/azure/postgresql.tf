resource "azurerm_private_dns_zone" "db" {
  name                = "db.private.postgres.database.azure.com"
  resource_group_name = var.resource_group_name
  depends_on = [
    azurerm_resource_group.rg,
  ]
}

resource "azurerm_private_dns_zone_virtual_network_link" "db_medplum_vnet" {
  name                  = "medplum-${var.environment}-${var.deployment_id}-postgres-db"
  private_dns_zone_name = azurerm_private_dns_zone.db.name
  resource_group_name   = var.resource_group_name
  virtual_network_id    = azurerm_virtual_network.medplum_vnet.id
}

resource "random_password" "postgresql_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}
# 
resource "azurerm_postgresql_flexible_server" "db" {
  auto_grow_enabled             = true
  backup_retention_days         = 30
  delegated_subnet_id           = azurerm_subnet.medplum_db_snet_01.id
  geo_redundant_backup_enabled  = false
  location                      = var.location
  private_dns_zone_id           = azurerm_private_dns_zone.db.id
  public_network_access_enabled = false
  name                          = "medplum-${var.environment}-${var.deployment_id}-postgres-db"
  resource_group_name           = var.resource_group_name
  sku_name                      = "B_Standard_B1ms" # "GP_Standard_D2s_v3"
  storage_mb                    = 32768
  version                       = 15
  administrator_login           = "medplumadmin"
  administrator_password        = random_password.postgresql_password.result
  authentication {
    password_auth_enabled         = true
    active_directory_auth_enabled = true
    tenant_id                     = data.azurerm_client_config.current.tenant_id
  }
  # https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/postgresql_flexible_server#zone
  lifecycle {
    ignore_changes = [
      zone,
      high_availability[0].standby_availability_zone
    ]
  }
  depends_on = [
    azurerm_resource_group.rg,
  ]

}

output "postgresql_password" {
  value     = random_password.postgresql_password.result
  sensitive = true
}

resource "azurerm_postgresql_flexible_server_configuration" "require_secure_transport" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "off"
}

resource "azurerm_postgresql_flexible_server_configuration" "azure_extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "pg_stat_statements,btree_gin,pg_trgm"
}

output "postgresql_dns_record" {
  description = "Custom DNS record (FQDN) for the PostgreSQL server in the private DNS zone"
  value       = format("%s.postgres.database.azure.com", azurerm_postgresql_flexible_server.db.name)
}
