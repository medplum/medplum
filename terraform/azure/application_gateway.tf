# Application Gateway configuration for Medplum API server.
# Provides HTTPS termination and load balancing for the AKS cluster.

resource "azurerm_public_ip" "medplum_app" {
  name                = "medplum-app-ip"
  resource_group_name = var.resource_group_name
  location            = var.location
  allocation_method   = "Static"
  sku                 = "Standard"
}

output "api_ip" {
  value = azurerm_public_ip.medplum_app.ip_address
}

resource "azurerm_application_gateway" "medplum_appgw" {
  name                = "medplum-appgateway"
  resource_group_name = var.resource_group_name
  location            = var.location

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = 2
  }

  gateway_ip_configuration {
    name      = "my-gateway-ip-configuration"
    subnet_id = azurerm_subnet.medplum_appgw_subnet.id
  }

  # HTTP port (for redirect)
  frontend_port {
    name = "http"
    port = 80
  }

  # HTTPS port
  frontend_port {
    name = "https"
    port = 443
  }

  frontend_ip_configuration {
    name                 = "medplum-frontend-ip"
    public_ip_address_id = azurerm_public_ip.medplum_app.id
  }

  backend_address_pool {
    name = "medplum-backend-pool"
  }

  backend_http_settings {
    name                  = "medplum-http-settings"
    cookie_based_affinity = "Disabled" # Medplum is stateless
    port                  = 80
    protocol              = "Http"
    request_timeout       = 60
  }

  # HTTP Listener
  http_listener {
    name                           = "http-listener"
    frontend_ip_configuration_name = "medplum-frontend-ip"
    frontend_port_name             = "http"
    protocol                       = "Http"
  }

  # HTTPS Listener
  http_listener {
    name                           = "https-listener"
    frontend_ip_configuration_name = "medplum-frontend-ip"
    frontend_port_name             = "https"
    protocol                       = "Https"
    ssl_certificate_name           = "medplum-cert" # Will be managed by cert-manager
  }

  # Redirect HTTP to HTTPS
  redirect_configuration {
    name                 = "http-to-https"
    redirect_type        = "Permanent"
    target_listener_name = "https-listener"
    include_path         = true
    include_query_string = true
  }

  # HTTP to HTTPS redirect rule
  request_routing_rule {
    name                        = "http-to-https-rule"
    priority                    = 1
    rule_type                   = "Basic"
    http_listener_name          = "http-listener"
    redirect_configuration_name = "http-to-https"
  }

  # Main routing rule for HTTPS
  request_routing_rule {
    name                       = "https-rule"
    priority                   = 2
    rule_type                  = "Basic"
    http_listener_name         = "https-listener"
    backend_address_pool_name  = "medplum-backend-pool"
    backend_http_settings_name = "medplum-http-settings"
  }

  lifecycle {
    # these are properties managed by Kubernetes/cert-manager
    ignore_changes = [
      tags,
      backend_address_pool,
      backend_http_settings,
      http_listener,
      probe,
      request_routing_rule,
      url_path_map,
      frontend_port,
      ssl_certificate,
      redirect_configuration
    ]
  }
}
