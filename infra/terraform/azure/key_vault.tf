# Azure Key Vault for application secrets
# Stores configuration values, API keys, and other sensitive data
# used by the Medplum server

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "vault" {
  name                = "${local.kv_prefix}secrets"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name

  tenant_id                  = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  sku_name                   = "standard"

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    virtual_network_subnet_ids = [
      azurerm_subnet.medplum_aks_nodes_snet_01.id
    ]
  }
}

# Key Vault access policy for operators/admins to manage secrets
resource "azurerm_key_vault_access_policy" "terraform" {
  key_vault_id = azurerm_key_vault.vault.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  key_permissions = [
    "Create",
    "Get",
    "List",
    "Update",
    "Delete",
    "Purge",
    "Recover",
    "GetRotationPolicy",
    "SetRotationPolicy",
  ]

  secret_permissions = [
    "Get",
    "List",
    "Set",
    "Delete",
    "Purge",
    "Recover"
  ]
}

# resource "azurerm_key_vault_access_policy" "current_user" {
#   key_vault_id = azurerm_key_vault.des_vault.id
#   object_id    = coalesce(var.managed_identity_principal_id, data.azurerm_client_config.current.object_id)
#   tenant_id    = data.azurerm_client_config.current.tenant_id
#   key_permissions = [
#     "Get",
#     "Create",
#     "Delete",
#     "GetRotationPolicy",
#     "Recover",
#   ]
# }

# Access policy for AKS to read secrets
resource "azurerm_key_vault_access_policy" "aks" {
  key_vault_id = azurerm_key_vault.vault.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_kubernetes_cluster.server_cluster.kubelet_identity[0].object_id

  secret_permissions = [
    "Get",
    "List"
  ]
}

output "key_vault_uri" {
  value = azurerm_key_vault.vault.vault_uri
}

# resource "azurerm_key_vault_access_policy" "admin" {
#   key_vault_id = azurerm_key_vault.vault.id
#   tenant_id    = data.azurerm_client_config.current.tenant_id
#   object_id    = data.azurerm_client_config.current.object_id

#   secret_permissions = [
#     "Get",
#     "List",
#     "Set",
#     "Delete",
#     "Purge",
#     "Recover"
#   ]
# }

# Key Vault access policy for Medplum server to read secrets
resource "azurerm_key_vault_access_policy" "server" {
  key_vault_id = azurerm_key_vault.vault.id
  tenant_id    = azurerm_kubernetes_cluster.server_cluster.identity[0].tenant_id
  object_id    = azurerm_kubernetes_cluster.server_cluster.identity[0].principal_id

  secret_permissions = [
    "Get",
    "List"
  ]
}

# data "azurerm_client_config" "current" {}

# resource "random_string" "key_vault_prefix" {
#   length  = 6
#   numeric = false
#   special = false
#   upper   = false
# }

# resource "azurerm_key_vault" "des_vault" {
#   location                      = var.location
#   name                          = "${random_string.key_vault_prefix.result}-des-keyvault"
#   resource_group_name           = azurerm_resource_group.rg.name
#   sku_name                      = "premium"
#   tenant_id                     = data.azurerm_client_config.current.tenant_id
#   enabled_for_disk_encryption   = true
#   purge_protection_enabled      = true
#   soft_delete_retention_days    = 7
#   public_network_access_enabled = true

#   #   network_acls {
#   #     bypass         = "AzureServices"
#   #     default_action = "Allow"
#   #     ip_rules       = [local.public_ip]
#   #   }
# }

# resource "azurerm_key_vault" "medplum_vault" {
#   location                      = var.location
#   name                          = "${random_string.key_vault_prefix.result}-medplum-keyvault"
#   resource_group_name           = azurerm_resource_group.rg.name
#   sku_name                      = "premium"
#   tenant_id                     = data.azurerm_client_config.current.tenant_id
#   enabled_for_disk_encryption   = true
#   purge_protection_enabled      = true
#   soft_delete_retention_days    = 7
#   public_network_access_enabled = true

#   #   network_acls {
#   #     bypass         = "AzureServices"
#   #     default_action = "Allow"
#   #     ip_rules       = [local.public_ip]
#   #   }
# }

# resource "azurerm_key_vault_access_policy" "current_user_medplum_vault" {
#   key_vault_id = azurerm_key_vault.medplum_vault.id
#   object_id    = coalesce(var.managed_identity_principal_id, data.azurerm_client_config.current.object_id)
#   tenant_id    = data.azurerm_client_config.current.tenant_id
#   secret_permissions = [
#     "Get",
#     "Set",
#     "Delete",
#     "List",
#     "Backup",
#     "Restore",
#   ]
# }

# resource "azurerm_key_vault_access_policy" "medplum_server" {
#   key_vault_id = azurerm_key_vault.medplum_vault.id
#   object_id    = azurerm_user_assigned_identity.medplum_server_identity.principal_id
#   tenant_id    = data.azurerm_client_config.current.tenant_id
#   secret_permissions = [
#     "Get",
#     "Set",
#     "List"
#   ]
# }
