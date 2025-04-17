resource "random_id" "cdn-random-id" {
  byte_length = 2
}

# Storage Account to host static content
resource "azurerm_storage_account" "sa" {
  name                     = "medplumapp${random_id.cdn-random-id.hex}"
  resource_group_name      = var.resource-group-name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html"
  }

  depends_on = [
    azurerm_resource_group.rg,
  ]
}

# Front Door Profile
resource "azurerm_cdn_frontdoor_profile" "fd-profile" {
  name                = "${azurerm_storage_account.sa.name}-fdprofile"
  resource_group_name = var.resource-group-name
  sku_name            = "Standard_AzureFrontDoor"
}

# Front Door Origin Group
resource "azurerm_cdn_frontdoor_origin_group" "fd-origin-group" {
  name                     = "${azurerm_storage_account.sa.name}-origingroup"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd-profile.id

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
resource "azurerm_cdn_frontdoor_origin" "fd-origin-group" {
  name                           = "${azurerm_storage_account.sa.name}-origin"
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.fd-origin-group.id
  host_name                      = azurerm_storage_account.sa.primary_web_host
  origin_host_header             = azurerm_storage_account.sa.primary_web_host
  certificate_name_check_enabled = false
  enabled                        = true
}

# Front Door Endpoint
resource "azurerm_cdn_frontdoor_endpoint" "fd-endpoint" {
  name                     = "${azurerm_storage_account.sa.name}-endpoint"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd-profile.id
}


# Front Door Route
resource "azurerm_cdn_frontdoor_route" "fd-route" {
  name                          = "${azurerm_storage_account.sa.name}-route"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.fd-endpoint.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.fd-origin-group.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.fd-origin-group.id]

  patterns_to_match   = ["/*"]
  forwarding_protocol = "HttpsOnly"
  supported_protocols = ["Https", "Http"]

  cache {
    query_string_caching_behavior = "IgnoreQueryString"
    compression_enabled           = true
    content_types_to_compress     = ["text/html", "text/css", "application/javascript", "application/json"]
  }

  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.fd-custom-domain.id]

  depends_on = [azurerm_cdn_frontdoor_origin_group.fd-origin-group]
}

resource "azurerm_cdn_frontdoor_custom_domain" "fd-custom-domain" {
  name                     = "${azurerm_storage_account.sa.name}-domain"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd-profile.id
  host_name                = var.app-domain

  tls {
    certificate_type        = "CustomerCertificate"
    minimum_tls_version     = "TLS12"
  }
}

# resource "azurerm_cdn_frontdoor_secret" "fd-custom-secret" {
#   name                     = "${azurerm_storage_account.sa.name}-secret"
#   cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd-profile.id

#   secret {
#     customer_certificate {
#       key_vault_certificate_id = var.app-certificate-secret-id
#     }
#   }
# }

resource "azurerm_cdn_frontdoor_custom_domain_association" "custom-domain-association" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.fd-custom-domain.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.fd-route.id]
}

output "cdn-endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.fd-endpoint.host_name
}