resource "azurerm_public_ip" "medplum-app" {
  name                = "${var.resource_naming_prefix}-app-ip"
  resource_group_name = var.resource-group-name
  location            = var.location
  allocation_method   = "Static"
  sku                 = "Standard"
}

output "api-ip" {
  value = azurerm_public_ip.medplum-app.ip_address
}

resource "azurerm_application_gateway" "medplum-appgw" {
  name                = "${var.resource_naming_prefix}-appgateway"
  resource_group_name = var.resource-group-name
  location            = var.location

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = 2
  }

  gateway_ip_configuration {
    name      = "${var.resource_naming_prefix}-gateway-ip-configuration"
    subnet_id = azurerm_subnet.medplum-appgw-subnet.id
  }

  frontend_port {
    name = "${var.resource_naming_prefix}-frontend-port"
    port = 80
  }

  frontend_ip_configuration {
    name                 = "${var.resource_naming_prefix}-frontend-ip"
    public_ip_address_id = azurerm_public_ip.medplum-app.id
  }

  backend_address_pool {
    name = "${var.resource_naming_prefix}-backend-pool"
  }

  backend_http_settings {
    name                  = "${var.resource_naming_prefix}-http-settings"
    cookie_based_affinity = "Enabled"
    # path                  = "/path1/"
    port            = 80
    protocol        = "Http"
    request_timeout = 60
  }

  http_listener {
    name                           = "${var.resource_naming_prefix}-listener"
    frontend_ip_configuration_name = "${var.resource_naming_prefix}-frontend-ip"
    frontend_port_name             = "${var.resource_naming_prefix}-frontend-port"
    protocol                       = "Http"
  }

  request_routing_rule {
    name                       = "${var.resource_naming_prefix}-rule"
    priority                   = 9
    rule_type                  = "Basic"
    http_listener_name         = "${var.resource_naming_prefix}-listener"
    backend_address_pool_name  = "${var.resource_naming_prefix}-backend-pool"
    backend_http_settings_name = "${var.resource_naming_prefix}-http-settings"
  }

  lifecycle {
    # these are properties managed by Kubernetes
    ignore_changes = [
      tags,
      backend_address_pool,
      backend_http_settings,
      http_listener,
      probe,
      request_routing_rule,
      url_path_map,
      frontend_port,
      ssl_certificate
    ]
  }
}
