# Azure Storage Account configuration for Medplum app.

# Storage Account to host static content
resource "azurerm_storage_account" "frontend" {
  name                     = "${var.project}${var.environment}frontend"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html"
  }
}

# Front Door Profile
resource "azurerm_cdn_frontdoor_profile" "fd_profile" {
  name                = "${var.project}${var.environment}fd"
  resource_group_name = var.resource_group_name
  sku_name            = "Standard_AzureFrontDoor"
}

# Front Door Origin Group
resource "azurerm_cdn_frontdoor_origin_group" "fd_origin_group" {
  name                     = "${var.project}${var.environment}origingroup"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd_profile.id

  load_balancing {
    sample_size                 = 4
    successful_samples_required = 3
  }

  health_probe {
    path                = "/index.html"
    request_type        = "HEAD"
    protocol            = "Https"
    interval_in_seconds = 100
  }
}

# Front Door Origin
resource "azurerm_cdn_frontdoor_origin" "fd_storage_origin" {
  name                           = "${var.project}${var.environment}origin"
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.fd_origin_group.id
  host_name                      = azurerm_storage_account.frontend.primary_web_host
  origin_host_header             = azurerm_storage_account.frontend.primary_web_host
  certificate_name_check_enabled = false
  enabled                        = true
}

# Front Door Endpoint
resource "azurerm_cdn_frontdoor_endpoint" "fd_endpoint" {
  name                     = "${var.project}${var.environment}endpoint"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd_profile.id
}

# Front Door Route
resource "azurerm_cdn_frontdoor_route" "fd_route" {
  name                          = "${var.project}${var.environment}route"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.fd_endpoint.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.fd_origin_group.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.fd_storage_origin.id]

  patterns_to_match   = ["/*"]
  forwarding_protocol = "HttpsOnly"
  supported_protocols = ["Https", "Http"]

  cache {
    query_string_caching_behavior = "IgnoreQueryString"
    compression_enabled           = true
    content_types_to_compress     = ["text/html", "text/css", "application/javascript", "application/json"]
  }

  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.fd_custom_domain.id]
}

resource "azurerm_cdn_frontdoor_custom_domain" "fd_custom_domain" {
  name                     = "${var.project}${var.environment}domain"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd_profile.id
  host_name                = var.app_domain

  tls {
    certificate_type    = "ManagedCertificate" # This is the key change
    minimum_tls_version = "TLS12"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "custom_domain_association" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.fd_custom_domain.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.fd_route.id]
}

output "cdn_endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.fd_endpoint.host_name
}
