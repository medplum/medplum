data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "des_vault" {
  location                      = var.location
  name                          = "medplum-${var.environment}-des-vault"
  resource_group_name           = var.resource_group_name
  sku_name                      = "premium"
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  enabled_for_disk_encryption   = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true

  #   network_acls {
  #     bypass         = "AzureServices"
  #     default_action = "Allow"
  #     ip_rules       = [local.public_ip]
  #   }
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
  name                          = "medplum-${var.environment}-${var.deployment_id}-keyvault"
  resource_group_name           = var.resource_group_name
  sku_name                      = "premium"
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  enabled_for_disk_encryption   = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true

  #   network_acls {
  #     bypass         = "AzureServices"
  #     default_action = "Allow"
  #     ip_rules       = [local.public_ip]
  #   }
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
