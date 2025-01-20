# Medplum Infrastructure for Azure

This terraform code will deploy the following resources:

- Azure Resource Group
- AKS
- Log Analytics Workspace
- KMS, DES and KeyVault for AKS
- CDN profile
- Azure PostgreSQL Flexible Server
- Redis cache
- Azure Storage Accounts (for app and storage)
- Application Gateway (API entrypoint)

It requires a certificate for the CDN custom domain. The certificate should be stored in a KeyVault. The KeyVault should be created before running the terraform code.

## Usage

1. Create a `terraform.tfvars` file with the following content:

```hcl
resource_group_name = "medplum-rg"
location = "eastus"
aks_name = "medplum-aks"
aks_node_count = 1
aks_node_size = "Standard_B2s"
aks_service_principal_id = "00000000-0000-0000-0000-000000000000"
aks_service_principal_secret = "000"
aks_keyvault_name = "medplum-kv"
aks_keyvault_certificate_name = "medplum-certificate"
cdn_profile_name = "medplum-cdn"
cdn_custom_domain = "medplum.com"
cdn_keyvault_name = "medplum-kv"
cdn_keyvault_certificate_name = "medplum-certificate"
postgres_server_name = "medplum-pg"
postgres_username = "medplum"
postgres_password = "password"
redis_name = "medplum-redis"
storage_account_name = "medplumstorage"
app_gateway_name = "medplum-ag"
```

2. Run the following commands:

```bash
terraform init
terraform apply
```

3. The terraform code will output the following values:

- `aks_kube_config`: The kube config for the AKS cluster
- `cdn_endpoint`: The CDN endpoint
- `postgres_fqdn`: The fully qualified domain name for the PostgreSQL server
- `redis_host`: The hostname for the Redis cache
- `storage_account_name`: The name of the storage account
- `app_gateway_fqdn`: The fully qualified domain name for the Application Gateway

## Azure Provider Version

This implementation uses Azure Provider (azurerm) version 4.x, which was released in June 2023. While version 3.x is still supported, we chose 4.x for new deployments because it:

- Aligns with current Azure best practices
- Provides access to newer Azure features
- Offers longer future support
- Is fully production-ready

We use the v4-compatible versions of modules (for example, `Azure/aks/azurerm//v4`) to ensure proper compatibility with the provider version.
