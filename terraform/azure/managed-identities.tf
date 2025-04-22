
# This is the identity used by the medplum server to access Azure resources like KeyVault and storage
resource "azurerm_user_assigned_identity" "medplum-server-identity" {
  location            = var.location
  name                = "${var.resource_naming_prefix}-server-${random_id.prefix.hex}"
  resource_group_name = var.resource-group-name
}

output "medplum-server-identity-name" {
  value = azurerm_user_assigned_identity.medplum-server-identity.name
}

output "medplum-server-identity-client-id" {
  value = azurerm_user_assigned_identity.medplum-server-identity.client_id
}
