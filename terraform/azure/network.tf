resource "azurerm_virtual_network" "medplum-vnet" {
  address_space       = ["10.52.0.0/16"]
  location            = var.location
  name                = "${var.resource_naming_prefix}-vnet"
  resource_group_name = var.resource-group-name

  depends_on = [azurerm_resource_group.rg]
}

resource "azurerm_subnet" "medplum-aks-nodes-snet-01" {
  name                 = "${var.resource_naming_prefix}-aks-nodes-sn"
  resource_group_name  = var.resource-group-name
  virtual_network_name = azurerm_virtual_network.medplum-vnet.name
  address_prefixes     = ["10.52.1.0/24"]
}

resource "azurerm_subnet" "medplum-aks-pods-snet-01" {
  name                 = "${var.resource_naming_prefix}-aks-pods-sn"
  resource_group_name  = var.resource-group-name
  virtual_network_name = azurerm_virtual_network.medplum-vnet.name
  address_prefixes     = ["10.52.200.0/22"]
  delegation {
    name = "aks-delegation"
    service_delegation {
      name = "Microsoft.ContainerService/managedClusters"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_subnet" "medplum-appgw-subnet" {
  name                 = "${var.resource_naming_prefix}-appgw-sn"
  resource_group_name  = var.resource-group-name
  virtual_network_name = azurerm_virtual_network.medplum-vnet.name
  address_prefixes     = ["10.52.0.0/24"]

}

resource "azurerm_subnet" "medplum-db-snet-01" {
  name                 = "${var.resource_naming_prefix}-db-sn"
  resource_group_name  = var.resource-group-name
  virtual_network_name = azurerm_virtual_network.medplum-vnet.name
  address_prefixes     = ["10.52.4.0/24"]
  service_endpoints    = ["Microsoft.Storage"]
  delegation {
    name = "fs"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_subnet" "medplum-redis-snet-01" {
  name                 = "${var.resource_naming_prefix}-redis-sn"
  resource_group_name  = var.resource-group-name
  virtual_network_name = azurerm_virtual_network.medplum-vnet.name
  address_prefixes     = ["10.52.6.0/24"]
}

