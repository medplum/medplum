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
