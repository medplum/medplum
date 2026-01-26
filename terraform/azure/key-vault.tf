data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "des_vault" {
  location                      = var.location
  name                          = "mp-${var.environment}-${var.deployment_id}-des"
  resource_group_name           = var.resource_group_name
  sku_name                      = "premium"
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  enabled_for_disk_encryption   = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true

  depends_on = [azurerm_resource_group.rg]
}

resource "azurerm_key_vault_access_policy" "current_user" {
  key_vault_id = azurerm_key_vault.des_vault.id
  object_id    = coalesce(var.managed_identity_principal_id, data.azurerm_client_config.current.object_id)
  tenant_id    = data.azurerm_client_config.current.tenant_id
  key_permissions = [
    "Get",
    "Create",
    "Delete",
    "GetRotationPolicy",
    "Recover",
  ]
}


resource "azurerm_key_vault" "medplum_vault" {
  location                      = var.location
  name                          = "mp-${var.environment}-${var.deployment_id}-kv"
  resource_group_name           = var.resource_group_name
  sku_name                      = "premium"
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  enabled_for_disk_encryption   = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true

  depends_on = [azurerm_resource_group.rg]
}

resource "azurerm_key_vault_access_policy" "current_user-medplum_vault" {
  key_vault_id = azurerm_key_vault.medplum_vault.id
  object_id    = coalesce(var.managed_identity_principal_id, data.azurerm_client_config.current.object_id)
  tenant_id    = data.azurerm_client_config.current.tenant_id
  secret_permissions = [
    "Get",
    "Set",
    "Delete",
    "List",
    "Backup",
    "Restore",
  ]
}

resource "azurerm_key_vault_access_policy" "medplum_server" {
  key_vault_id = azurerm_key_vault.medplum_vault.id
  object_id    = azurerm_user_assigned_identity.medplum_server_identity.principal_id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  secret_permissions = [
    "Get",
    "Set",
    "List"
  ]
}

output "key_vault_name" {
  description = "The name of the Medplum Key Vault"
  value       = azurerm_key_vault.medplum_vault.name
}
