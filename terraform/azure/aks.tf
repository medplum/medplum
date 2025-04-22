resource "random_id" "prefix" {
  byte_length = 8
}

resource "azurerm_user_assigned_identity" "aks-identity" {
  location            = var.location
  name                = "${random_id.prefix.hex}-identity"
  resource_group_name = var.resource-group-name
}

module "medplum-aks" {
  source  = "Azure/aks/azurerm"
  version = "9.2.0"

  prefix                               = "medplum-aks"
  resource_group_name                  = var.resource-group-name
  admin_username                       = null
  cluster_log_analytics_workspace_name = "medplum-aks"
  cluster_name                         = "medplum-aks"
  disk_encryption_set_id               = azurerm_disk_encryption_set.des-disk-encryption-set.id
  identity_ids                         = [azurerm_user_assigned_identity.aks-identity.id]
  identity_type                        = "UserAssigned"
  log_analytics_solution = {
    id = azurerm_log_analytics_solution.main.id
  }
  log_analytics_workspace_enabled = true
  log_analytics_workspace = {
    id   = azurerm_log_analytics_workspace.main.id
    name = azurerm_log_analytics_workspace.main.name
  }
  maintenance_window = {
    allowed = [
      {
        day   = "Sunday",
        hours = [22, 23]
      },
    ]
    not_allowed = []
  }
  private_cluster_enabled           = false # set to true for fully private
  rbac_aad                          = true
  rbac_aad_managed                  = true
  role_based_access_control_enabled = true
  oidc_issuer_enabled               = true
  workload_identity_enabled         = true

  vnet_subnet_id = azurerm_subnet.medplum-aks-nodes-snet-01.id
  pod_subnet_id  = azurerm_subnet.medplum-aks-pods-snet-01.id
  network_plugin = "azure"

  #   KMS etcd encryption
  kms_enabled                  = true
  kms_key_vault_key_id         = azurerm_key_vault_key.kms.id
  kms_key_vault_network_access = "Public"

  # Connect existing app gateway 
  brown_field_application_gateway_for_ingress = {
    id        = azurerm_application_gateway.medplum-appgw.id
    subnet_id = azurerm_subnet.medplum-appgw-subnet.id
  }


  depends_on = [
    azurerm_resource_group.rg,
    azurerm_key_vault_access_policy.kms,
    azurerm_role_assignment.kms
  ]

}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.resource_naming_prefix}-log-analytics"
  location            = var.location
  resource_group_name = var.resource-group-name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  lifecycle {
    ignore_changes = [
      tags
    ]
  }
}

resource "azurerm_log_analytics_solution" "main" {

  solution_name         = "ContainerInsights"
  location              = var.location
  resource_group_name   = var.resource-group-name
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/ContainerInsights"
  }

  lifecycle {
    ignore_changes = [
      tags
    ]
  }
}

output "managed-identity-id" {
  value = azurerm_user_assigned_identity.aks-identity.name
}

output "managed-identity-client-id" {
  value = azurerm_user_assigned_identity.aks-identity.client_id
}

output "oidc-issuer-url" {
  value = module.medplum-aks.oidc_issuer_url
}
