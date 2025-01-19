# Resource Group is a fundamental concept in Azure - it's a container that holds
# related resources. Every Azure resource must be in a resource group. Think of
# it like a project folder for your cloud resources.

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}
