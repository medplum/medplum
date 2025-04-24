environment = "demo"
aws_account = "347383665746"

vault_identifier = "medplum"
vault_address    = "https://vault.fortymadison.com"

vault_auth_namespace             = "demo"
vault_kubernetes_auth_role_name  = "medplum-service"
vault_auth_bound_service_account = "medplum-sa"

vault_policy = <<-EOT
  path "database/creds/platform-demo-read-write" {
    capabilities = [ "read" ]
  }
  path "kv/data/medplum" {
    capabilities = ["read", "list"]
  }
EOT