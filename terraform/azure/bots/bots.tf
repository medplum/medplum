
variable "base_name" {
  description = "A base name for resources to help ensure uniqueness. Keep it short and alphanumeric."
  type        = string
  default     = "medplum"
}

variable "node_version_stack" {
  description = "The Node.js version for the Function App's application stack (e.g., '20-lts', '18-lts')."
  type        = string
  default     = "20"
}

variable "functions_extension_version" {
  description = "The Azure Functions extension version (e.g., '~4' for Functions v4, '~5' for v5 if available/needed)."
  type        = string
  default     = "~4"
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  // Sanitized base_name for storage account (lowercase, no hyphens, max 24 chars)
  storage_account_name_sanitized = substr(lower(replace(var.base_name, "/[^a-z0-9]/", "")), 0, 18)
  unique_suffix                  = random_string.suffix.result

  actual_storage_account_name = "${local.storage_account_name_sanitized}${local.unique_suffix}"
  actual_function_app_name    = "${var.base_name}-func-${local.unique_suffix}"
  app_service_plan_name       = "${var.base_name}-asp-${local.unique_suffix}"

}

resource "azurerm_storage_account" "bots_sa" {
  name                     = local.actual_storage_account_name
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  min_tls_version          = "TLS1_2"

  depends_on = [
    azurerm_resource_group.rg,
  ]
}

resource "azurerm_service_plan" "plan" {
  name                = local.app_service_plan_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "Y1" // SKU for Linux Consumption plan (Dynamic tier)
}


resource "azurerm_linux_function_app" "func_app" {
  name                = local.actual_function_app_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  storage_account_name       = azurerm_storage_account.bots_sa.name
  storage_account_access_key = azurerm_storage_account.bots_sa.primary_access_key
  service_plan_id            = azurerm_service_plan.plan.id

  site_config {
    application_stack {
      node_version = var.node_version_stack
    }
    always_on           = false
    ftps_state          = "FtpsOnly"
    http2_enabled       = true
    minimum_tls_version = "1.2"

    cors {
      allowed_origins = ["*"] // Adjust as needed for security
    }
  }

  functions_extension_version = var.functions_extension_version

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME" = "node"
    "WEBSITE_RUN_FROM_PACKAGE" = "0"
    "WEBSITE_MOUNT_ENABLED"    = "true"
  }

  identity {
    type = "SystemAssigned"
  }

  depends_on = [
    azurerm_storage_account.bots_sa,
    azurerm_service_plan.plan
  ]
}

// Outputs
output "function_app_name" {
  description = "The name of the deployed Azure Function App."
  value       = azurerm_linux_function_app.func_app.name
}

output "function_app_default_hostname" {
  description = "The default hostname of the Function App."
  value       = azurerm_linux_function_app.func_app.default_hostname
}

output "function_app_id" {
  description = "The ID of the Azure Function App."
  value       = azurerm_linux_function_app.func_app.id
}

output "storage_account_name" {
  description = "The name of the Azure Storage Account used by the Function App."
  value       = azurerm_storage_account.bots_sa.name
}
