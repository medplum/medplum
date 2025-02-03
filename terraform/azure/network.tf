resource "azurerm_virtual_network" "medplum_vnet" {
  address_space       = ["10.52.0.0/16"]
  location            = var.location
  name                = "medplum-vnet"
  resource_group_name = var.resource_group_name

  depends_on = [azurerm_resource_group.rg]
}

resource "azurerm_subnet" "medplum_aks_nodes_snet_01" {
  name                 = "medplum-aks-nodes-sn"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.medplum_vnet.name
  address_prefixes     = ["10.52.1.0/24"]
}

resource "azurerm_subnet" "medplum_aks_pods_snet_01" {
  name                 = "medplum-aks-pods-sn"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.medplum_vnet.name
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

resource "azurerm_subnet" "medplum_appgw_subnet" {
  name                 = "medplum-appgw-sn"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.medplum_vnet.name
  address_prefixes     = ["10.52.0.0/24"]

}

resource "azurerm_subnet" "medplum_db_snet_01" {
  name                 = "medplum-db-sn"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.medplum_vnet.name
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

resource "azurerm_subnet" "medplum_redis_snet_01" {
  name                 = "medplum-redis-sn"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.medplum_vnet.name
  address_prefixes     = ["10.52.6.0/24"]
}

