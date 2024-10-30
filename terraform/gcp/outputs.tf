output "redis_ip_address" {
  value = module.memorystore.host
}
output "redis_port" {
  value = module.memorystore.port
}
output "postgres_ip_address" {
  value = module.sql-db.instance_ip_address[0].ip_address
}

