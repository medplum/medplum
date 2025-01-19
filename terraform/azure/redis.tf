# Azure Redis Cache configuration for Medplum.
# Sets up a private Redis instance required for:
# - FHIR resource caching
# - BullMQ job queue management
# Includes private DNS and endpoints for secure access.

resource "azurerm_private_dns_zone" "redis" {
  name                = "redis.private.redis.cache.azure.com"
  resource_group_name = var.resource_group_name
  depends_on          = [azurerm_resource_group.rg]
}

resource "azurerm_private_dns_zone_virtual_network_link" "redis-medplum-vnet" {
  name                  = "medplum-redis"
  private_dns_zone_name = azurerm_private_dns_zone.redis.name
  resource_group_name   = var.resource_group_name
  virtual_network_id    = azurerm_virtual_network.medplum_vnet.id
}

resource "azurerm_redis_cache" "medplum_cache" {
  name                = "medplum-redis-cache"
  location            = var.location
  resource_group_name = var.resource_group_name

  # Performance settings
  capacity = var.redis_capacity
  family   = var.redis_family
  sku_name = var.redis_sku_name

  # Security settings
  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"
}

resource "azurerm_private_endpoint" "redis" {
  name                = "medplum-redis"
  resource_group_name = var.resource_group_name
  location            = var.location
  subnet_id           = azurerm_subnet.medplum_redis_snet_01.id

  private_service_connection {
    name                           = "medplum-redis"
    private_connection_resource_id = azurerm_redis_cache.medplum_cache.id
    is_manual_connection           = false
    subresource_names              = ["redisCache"]
  }
}

resource "azurerm_private_dns_a_record" "redis_record" {
  name                = azurerm_redis_cache.medplum_cache.name
  zone_name           = azurerm_private_dns_zone.redis.name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  records             = [azurerm_private_endpoint.redis.private_service_connection[0].private_ip_address]
}

output "redis_hostname" {
  description = "Redis Cache hostname for Medplum server configuration"
  value       = azurerm_redis_cache.medplum_cache.hostname
}