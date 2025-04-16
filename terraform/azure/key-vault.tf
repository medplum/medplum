data "azurerm_client_config" "current" {}

resource "random_string" "key-vault-subfix" {
  length  = 3
  numeric = false
  special = false
  upper   = false
}

resource "azurerm_key_vault" "des-vault" {
  location                      = var.location
  name                          = "${var.resource-naming-prefix}-des-keyvault-${random_string.key-vault-subfix.result}"
  resource_group_name           = var.resource-group-name
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

resource "azurerm_key_vault_access_policy" "current-user" {
  key_vault_id = azurerm_key_vault.des-vault.id
  object_id    = coalesce(var.managed-identity-principal-id, data.azurerm_client_config.current.object_id)
  tenant_id    = data.azurerm_client_config.current.tenant_id
  key_permissions = [
    "Get",
    "Create",
    "Delete",
    "GetRotationPolicy",
    "Recover",
  ]
}


resource "azurerm_key_vault" "medplum-vault" {
  location                      = var.location
  name                          = "${random_string.key-vault-subfix.result}-medplum-keyvault"
  resource_group_name           = var.resource-group-name
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

resource "azurerm_key_vault_access_policy" "current-user-medplum-vault" {
  key_vault_id = azurerm_key_vault.medplum-vault.id
  object_id    = coalesce(var.managed-identity-principal-id, data.azurerm_client_config.current.object_id)
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

resource "azurerm_key_vault_access_policy" "medplum-server" {
  key_vault_id = azurerm_key_vault.medplum-vault.id
  object_id    = azurerm_user_assigned_identity.medplum-server-identity.principal_id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  secret_permissions = [
    "Get",
    "Set",
    "List"
  ]
}
