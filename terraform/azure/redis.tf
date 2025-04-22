
resource "azurerm_private_dns_zone" "redis" {
  name                = "redis.private.redis.cache.azure.com"
  resource_group_name = var.resource_group_name

  depends_on = [
    azurerm_resource_group.rg,
  ]
}

resource "azurerm_private_dns_zone_virtual_network_link" "redis_medplum_vnet" {
  name                  = "medplum-${var.environment}-${var.deployment_id}-redis"
  private_dns_zone_name = azurerm_private_dns_zone.redis.name
  resource_group_name   = var.resource_group_name
  virtual_network_id    = azurerm_virtual_network.medplum_vnet.id
}

resource "azurerm_redis_cache" "medplum_cache" {
  name                 = "medplum-${var.environment}-${var.deployment_id}-redis-cache"
  location             = var.location
  resource_group_name  = var.resource_group_name
  capacity             = 2
  family               = "C"
  sku_name             = "Standard"
  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"

  redis_configuration {
  }
}

resource "azurerm_private_endpoint" "redis" {
  count               = 1
  name                = "medplum-${var.environment}-${var.deployment_id}-redis"
  resource_group_name = var.resource_group_name
  location            = var.location
  subnet_id           = azurerm_subnet.medplum_redis_snet_01.id

  private_service_connection {
    name                           = "medplum-${var.environment}-${var.deployment_id}-redis"
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
  records             = [azurerm_private_endpoint.redis[0].private_service_connection[0].private_ip_address]
}

output "redis_hostname" {
  description = "The hostname of the Redis Cache"
  value       = azurerm_redis_cache.medplum_cache.hostname
}
