resource "azurerm_public_ip" "medplum_app" {
  name                = "medplum-${var.environment}-${var.deployment_id}-app-ip"
  resource_group_name = var.resource_group_name
  location            = var.location
  allocation_method   = "Static"
  sku                 = "Standard"
}

output "api-ip" {
  value = azurerm_public_ip.medplum_app.ip_address
}

resource "azurerm_application_gateway" "medplum_appgw" {
  name                = "medplum-${var.environment}-${var.deployment_id}-appgateway"
  resource_group_name = var.resource_group_name
  location            = var.location

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = 2
  }

  gateway_ip_configuration {
    name      = "medplum-${var.environment}-${var.deployment_id}-gateway-ip-configuration"
    subnet_id = azurerm_subnet.medplum_appgw_subnet.id
  }

  frontend_port {
    name = "medplum-${var.environment}-${var.deployment_id}-frontend-port"
    port = 80
  }

  frontend_ip_configuration {
    name                 = "medplum-${var.environment}-${var.deployment_id}-frontend-ip"
    public_ip_address_id = azurerm_public_ip.medplum_app.id
  }

  backend_address_pool {
    name = "medplum-${var.environment}-${var.deployment_id}-backend-pool"
  }

  backend_http_settings {
    name                  = "medplum-${var.environment}-${var.deployment_id}-http-settings"
    cookie_based_affinity = "Enabled"
    # path                  = "/path1/"
    port            = 80
    protocol        = "Http"
    request_timeout = 60
  }

  http_listener {
    name                           = "medplum-${var.environment}-${var.deployment_id}-listener"
    frontend_ip_configuration_name = "medplum-${var.environment}-${var.deployment_id}-frontend-ip"
    frontend_port_name             = "medplum-${var.environment}-${var.deployment_id}-frontend-port"
    protocol                       = "Http"
  }

  request_routing_rule {
    name                       = "medplum-${var.environment}-${var.deployment_id}-rule"
    priority                   = 9
    rule_type                  = "Basic"
    http_listener_name         = "medplum-${var.environment}-${var.deployment_id}-listener"
    backend_address_pool_name  = "medplum-${var.environment}-${var.deployment_id}-backend-pool"
    backend_http_settings_name = "medplum-${var.environment}-${var.deployment_id}-http-settings"
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
