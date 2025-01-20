terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "=4.16.0"
    }
  }
}

provider "azurerm" {
  subscription_id = "fe6cbbd0-124d-432f-b823-3bc6deec4d35"
  features {}
}
