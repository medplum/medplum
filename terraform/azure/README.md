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