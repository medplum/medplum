terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">=3.51.0, < 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4" # For local_file
    }
  }
}

provider "azurerm" {
  features {}
}
