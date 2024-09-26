output "sql_db_generated_user_password" {
  description = "The password for the default user."
  value       = module.sql-db.generated_user_password
  sensitive   = true
}
