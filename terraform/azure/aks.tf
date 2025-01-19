# Azure Kubernetes Service (AKS) configuration for Medplum.
# Creates a basic AKS cluster with Application Gateway ingress.

module "medplum_aks" {
  source  = "Azure/aks/azurerm"
  version = "9.2.0"

  prefix              = "medplum"
  resource_group_name = var.resource_group_name
  cluster_name        = "medplum-aks"

  # Network configuration
  vnet_subnet_id = azurerm_subnet.medplum_aks_nodes_snet_01.id
  pod_subnet_id  = azurerm_subnet.medplum_aks_pods_snet_01.id
  network_plugin = "azure"

  # Basic security settings
  private_cluster_enabled = false
  identity_type           = "SystemAssigned"

  # Application Gateway integration
  brown_field_application_gateway_for_ingress = {
    id        = azurerm_application_gateway.medplum_appgw.id
    subnet_id = azurerm_subnet.medplum_appgw_subnet.id
  }

  depends_on = [
    azurerm_resource_group.rg
  ]
}

# TODO: Is this necessary?
output "oidc_issuer_url" {
  value = module.medplum_aks.oidc_issuer_url
}
