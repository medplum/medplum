# Azure DNS Zone for Medplum
# ==========================
# This creates a DNS zone that you'll delegate from Squarespace
# by adding NS records pointing to Azure's nameservers

resource "azurerm_dns_zone" "medplum" {
  name                = "darren-azure.foomedical.dev"
  resource_group_name = var.resource_group_name

  depends_on = [azurerm_resource_group.rg]
}

# A record for API (points to Application Gateway public IP)
resource "azurerm_dns_a_record" "api" {
  name                = "api"
  zone_name           = azurerm_dns_zone.medplum.name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  records             = [azurerm_public_ip.medplum_app.ip_address]
}

# CNAME record for App (points to Azure Front Door CDN endpoint)
resource "azurerm_dns_cname_record" "app" {
  name                = "app"
  zone_name           = azurerm_dns_zone.medplum.name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  record              = azurerm_cdn_frontdoor_endpoint.fd_endpoint.host_name
}

# Output the nameservers - you'll add these to Squarespace
output "dns_nameservers" {
  description = "Add these as NS records in Squarespace for 'darren-azure' subdomain"
  value       = azurerm_dns_zone.medplum.name_servers
}

output "api_fqdn" {
  description = "Full API URL"
  value       = "api.${azurerm_dns_zone.medplum.name}"
}

output "app_fqdn" {
  description = "Full App URL"
  value       = "app.${azurerm_dns_zone.medplum.name}"
}
