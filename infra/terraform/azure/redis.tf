# Azure Redis Cache configuration for Medplum.
# Sets up a private Redis instance required for:
# - FHIR resource caching
# - BullMQ job queue management
# Includes private DNS and endpoints for secure access.

resource "azurerm_private_dns_zone" "redis" {
  name                = "redis.private.redis.cache.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "redis" {
  name                  = "${local.resource_prefix}-redis-vnet-link"
  private_dns_zone_name = azurerm_private_dns_zone.redis.name
  resource_group_name   = azurerm_resource_group.rg.name
  virtual_network_id    = azurerm_virtual_network.server_vnet.id
}

resource "azurerm_redis_cache" "redis" {
  name                = "${local.resource_prefix}-redis-cache"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name

  # Performance settings
  capacity = var.redis_capacity
  family   = var.redis_family
  sku_name = var.redis_sku_name

  # Security settings
  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"
}

resource "azurerm_private_endpoint" "redis" {
  name                = "${local.resource_prefix}-redis"
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  subnet_id           = azurerm_subnet.medplum_redis_snet_01.id

  private_service_connection {
    name                           = "${local.resource_prefix}-redis-connection"
    private_connection_resource_id = azurerm_redis_cache.redis.id
    is_manual_connection           = false
    subresource_names              = ["redisCache"]
  }
}

resource "azurerm_private_dns_a_record" "redis_record" {
  name                = "${local.resource_prefix}-redis-record"
  zone_name           = azurerm_private_dns_zone.redis.name
  resource_group_name = azurerm_resource_group.rg.name
  ttl                 = 300
  records             = [azurerm_private_endpoint.redis.private_service_connection[0].private_ip_address]
}

output "redis_hostname" {
  description = "Redis Cache hostname for Medplum server configuration"
  value       = azurerm_redis_cache.redis.hostname
}