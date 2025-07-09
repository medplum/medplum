resource "azurerm_user_assigned_identity" "aks_identity" {
  location            = var.location
  name                = "medplum-${var.environment}-${var.deployment_id}-identity"
  resource_group_name = var.resource_group_name
}

module "medplum_aks" {
  source  = "Azure/aks/azurerm"
  version = "9.2.0"

  prefix                               = "medplum-${var.environment}-${var.deployment_id}-aks"
  resource_group_name                  = var.resource_group_name
  admin_username                       = null
  cluster_log_analytics_workspace_name = "medplum-${var.environment}-${var.deployment_id}-aks"
  cluster_name                         = "medplum-${var.environment}-${var.deployment_id}-aks"
  disk_encryption_set_id               = azurerm_disk_encryption_set.des_disk_encryption_set.id
  identity_ids                         = [azurerm_user_assigned_identity.aks_identity.id]
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

  vnet_subnet_id = azurerm_subnet.medplum_aks_nodes_snet_01.id
  pod_subnet_id  = azurerm_subnet.medplum_aks_pods_snet_01.id
  network_plugin = "azure"

  #   KMS etcd encryption
  kms_enabled                  = true
  kms_key_vault_key_id         = azurerm_key_vault_key.kms.id
  kms_key_vault_network_access = "Public"

  # Connect existing app gateway 
  brown_field_application_gateway_for_ingress = {
    id        = azurerm_application_gateway.medplum_appgw.id
    subnet_id = azurerm_subnet.medplum_appgw_subnet.id
  }


  depends_on = [
    azurerm_resource_group.rg,
    azurerm_key_vault_access_policy.kms,
    azurerm_role_assignment.kms
  ]

}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "medplum-${var.environment}-${var.deployment_id}-log-analytics"
  location            = var.location
  resource_group_name = var.resource_group_name
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
  resource_group_name   = var.resource_group_name
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

output "managed_identity_id" {
  value = azurerm_user_assigned_identity.aks_identity.name
}

output "managed_identity_client_id" {
  value = azurerm_user_assigned_identity.aks_identity.client_id
}

output "oidc_issuer_url" {
  value = module.medplum_aks.oidc_issuer_url
}
