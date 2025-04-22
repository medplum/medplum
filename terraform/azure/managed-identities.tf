
# This is the identity used by the medplum server to access Azure resources like KeyVault and storage
resource "azurerm_user_assigned_identity" "medplum_server_identity" {
  location            = var.location
  name                = "medplum-${var.environment}-${var.deployment_id}-server"
  resource_group_name = var.resource_group_name
}

output "medplum_server_identity_name" {
  value = azurerm_user_assigned_identity.medplum_server_identity.name
}

output "medplum_server_identity_client_id" {
  value = azurerm_user_assigned_identity.medplum_server_identity.client_id
}
