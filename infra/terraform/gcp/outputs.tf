# This file defines output variables for the Terraform configuration.
# These outputs are used to expose specific values from the infrastructure setup,
# making them accessible for other Terraform configurations or external systems.
# 
# Usage:
# - The `redis_ip_address` output provides the IP address of the Redis instance
#   created using Google Cloud's Memorystore service. This can be used to connect
#   to the Redis instance from other services or applications within the same VPC.
# - The `postgres_ip_address` output provides the IP address of the PostgreSQL
#   database instance. This is useful for applications or services that need to
#   connect to the database for data storage and retrieval.
# 
# To access these outputs, use the `terraform output` command after applying the
# Terraform configuration. For example:
# 
#   terraform output redis_ip_address
#   terraform output postgres_ip_address

output "redis_ip_address" {
  value = module.memorystore.host
}
output "postgres_ip_address" {
  value = module.sql-db.instance_ip_address[0].ip_address
}