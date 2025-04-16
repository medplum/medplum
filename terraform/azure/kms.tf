resource "azurerm_key_vault_key" "des_key" {
  key_opts = [
    "decrypt",
    "encrypt",
    "sign",
    "unwrapKey",
    "verify",
    "wrapKey",
  ]
  key_type     = "RSA-HSM"
  key_vault_id = azurerm_key_vault.des-vault.id
  name         = "des-key"
  # expiration_date = timeadd("${formatdate("YYYY-MM-DD", timestamp())}T00:00:00Z", "168h")
  key_size = 2048

  depends_on = [
    azurerm_key_vault_access_policy.current-user
  ]

  lifecycle {
    ignore_changes = [expiration_date]
  }
}

resource "azurerm_disk_encryption_set" "des-disk-encryption-set" {
  key_vault_key_id    = azurerm_key_vault_key.des_key.id
  location            = var.location
  name                = "des"
  resource_group_name = var.resource-group-name

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_key_vault_access_policy" "des-access-policy" {
  key_vault_id = azurerm_key_vault.des-vault.id
  object_id    = azurerm_disk_encryption_set.des-disk-encryption-set.identity[0].principal_id
  tenant_id    = azurerm_disk_encryption_set.des-disk-encryption-set.identity[0].tenant_id
  key_permissions = [
    "Get",
    "WrapKey",
    "UnwrapKey"
  ]
}

resource "azurerm_key_vault_key" "kms" {
  key_opts = [
    "decrypt",
    "encrypt",
    "sign",
    "unwrapKey",
    "verify",
    "wrapKey",
  ]
  key_type     = "RSA"
  key_vault_id = azurerm_key_vault.des-vault.id
  name         = "etcd-encryption"
  # expiration_date = timeadd("${formatdate("YYYY-MM-DD", timestamp())}T00:00:00Z", "168h")
  key_size = 2048

  depends_on = [
    azurerm_key_vault_access_policy.current-user
  ]

  lifecycle {
    ignore_changes = [expiration_date]
  }
}

resource "azurerm_key_vault_access_policy" "kms" {
  key_vault_id = azurerm_key_vault.des-vault.id
  object_id    = azurerm_user_assigned_identity.aks-identity.principal_id
  tenant_id    = azurerm_user_assigned_identity.aks-identity.tenant_id
  key_permissions = [
    "Decrypt",
    "Encrypt",
  ]
}

resource "azurerm_role_assignment" "kms" {
  principal_id         = azurerm_user_assigned_identity.aks-identity.principal_id
  scope                = azurerm_key_vault.des-vault.id
  role_definition_name = "Key Vault Contributor"
}

