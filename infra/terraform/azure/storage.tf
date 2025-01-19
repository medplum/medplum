# Azure Storage Account configuration for Medplum storage.
# Creates a general-purpose v2 storage account and container for storing
# binary content (documents, images, videos, etc.)

resource "azurerm_storage_account" "app_storage_account" {
  name                = "medplum${random_id.prefix.hex}"
  resource_group_name = var.resource_group_name
  location            = var.location

  account_kind             = "StorageV2"
  account_tier             = var.storage_account_tier
  account_replication_type = var.storage_replication_type

  # CORS rules for browser uploads
  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "PUT", "POST"]
      allowed_origins    = var.storage_allowed_origins
      exposed_headers    = ["ETag"]
      max_age_in_seconds = 3600
    }
  }
}

# Main storage container for all binary content
resource "azurerm_storage_container" "content" {
  name                  = "content"
  container_access_type = "private"
  storage_account_id    = azurerm_storage_account.app_storage_account.id
}

# Private networking configuration
resource "azurerm_private_endpoint" "storage" {
  name                = "medplum-storage"
  resource_group_name = var.resource_group_name
  location            = var.location
  subnet_id           = azurerm_subnet.medplum_db_snet_01.id

  private_service_connection {
    name                           = "medplum-storage"
    private_connection_resource_id = azurerm_storage_account.app_storage_account.id
    is_manual_connection           = false
    subresource_names              = ["blob"]
  }
}
