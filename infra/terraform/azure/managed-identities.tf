
# This is the identity used by the medplum server to access Azure resources like KeyVault and storage
resource "azurerm_user_assigned_identity" "medplum_server_identity" {
  location            = var.location
  name                = "${local.resource_prefix}-server-identity"
  resource_group_name = azurerm_resource_group.rg.name
}

output "server_identity_name" {
  value = azurerm_user_assigned_identity.medplum_server_identity.name
}

output "server_identity_client_id" {
  value = azurerm_user_assigned_identity.medplum_server_identity.client_id
}
