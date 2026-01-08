terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.106.1, < 4.0.0"
    }
  }
}

provider "azurerm" {
  features {}
}
