output "sql_db_generated_user_password" {
  description = "The password for the default user."
  value       = module.sql-db.generated_user_password
  sensitive   = true
}

output "redis_ip_address" {
  value = module.redis_cluster.redis_cluster.discovery_endpoints[0].address
}
