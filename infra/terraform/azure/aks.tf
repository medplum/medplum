# Azure Kubernetes Service (AKS) configuration for Medplum.
# Creates a basic AKS cluster with Application Gateway ingress.

resource "azurerm_user_assigned_identity" "aks_identity" {
  location            = var.location
  name                = "${local.resource_prefix}-aks-identity"
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_kubernetes_cluster" "server_cluster" {
  name                = "medplum-aks"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = "medplum-aks"

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    pod_cidr            = var.aks_pods_subnet_cidr
    service_cidr        = var.service_cidr
    dns_service_ip      = var.dns_service_ip
  }

  private_cluster_enabled = false

  identity {
    type = "SystemAssigned"
  }

  default_node_pool {
    name           = var.aks_default_pool_name
    vnet_subnet_id = azurerm_subnet.medplum_aks_nodes_snet_01.id
    vm_size        = var.aks_node_size
    node_count     = var.aks_node_count
  }
}

# AKS Disk Encryption configuration
resource "azurerm_key_vault" "des_vault" {
  name                = "${local.kv_prefix}des"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  soft_delete_retention_days = 7
  purge_protection_enabled   = true # Required for disk encryption
}

resource "azurerm_key_vault_key" "des_key" {
  name         = "${local.resource_prefix}-disk-key"
  key_vault_id = azurerm_key_vault.des_vault.id
  key_type     = "RSA"
  key_size     = 2048

  key_opts = [
    "decrypt", "encrypt", "sign",
    "unwrapKey", "verify", "wrapKey"
  ]

  lifecycle {
    ignore_changes = [rotation_policy]
  }

  depends_on = [azurerm_key_vault_access_policy.des_vault_terraform]
}

resource "azurerm_disk_encryption_set" "des" {
  name                = "${local.resource_prefix}-des"
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  key_vault_key_id    = azurerm_key_vault_key.des_key.id

  identity {
    type = "SystemAssigned"
  }
}

# Grant the Disk Encryption Set access to the Key Vault
resource "azurerm_key_vault_access_policy" "des" {
  key_vault_id = azurerm_key_vault.des_vault.id
  tenant_id    = azurerm_disk_encryption_set.des.identity.0.tenant_id
  object_id    = azurerm_disk_encryption_set.des.identity.0.principal_id

  key_permissions = [
    "Get", "WrapKey", "UnwrapKey"
  ]
}

# Key Vault access policy for operators/admins to manage secrets
resource "azurerm_key_vault_access_policy" "des_vault_terraform" {
  key_vault_id = azurerm_key_vault.des_vault.id
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