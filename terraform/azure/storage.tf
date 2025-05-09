resource "random_id" "storage_random_id" {
  byte_length = 2
}

resource "azurerm_storage_account" "app_storage_account" {
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location

  name = "medplumstorage${random_id.storage_random_id.hex}"

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  depends_on = [
    azurerm_resource_group.rg,
  ]
}

resource "azurerm_storage_container" "app_storage_container" {
  name                  = "medplum-${var.environment}-${var.deployment_id}-app-container"
  storage_account_name  = azurerm_storage_account.app_storage_account.name
  container_access_type = "private"
}

resource "azurerm_role_assignment" "server_identity_role_assignment" {
  scope                = azurerm_storage_account.app_storage_account.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = azurerm_user_assigned_identity.medplum_server_identity.principal_id
}