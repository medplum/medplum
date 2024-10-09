output "sql_db_generated_user_password" {
  description = "The password for the default user."
  value       = module.sql-db.generated_user_password
  sensitive   = true
}
output "elb_public_ip" {
  description = "The public IP address of the external load balancer."
  value       = google_compute_global_address.elb_public_ip.address
}
