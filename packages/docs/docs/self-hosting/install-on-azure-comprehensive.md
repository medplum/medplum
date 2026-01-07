---
sidebar_position: 8
---

# Install on Azure (Comprehensive Guide)

This guide provides step-by-step instructions for deploying Medplum on Microsoft Azure using Terraform and Helm. It covers infrastructure provisioning, DNS configuration, TLS certificate setup, and application deployment.

:::caution

This deployment requires proficiency with Azure, Terraform, Kubernetes, and command-line tools. The process involves multiple Azure services and careful configuration.

If you have questions, please [contact us](mailto:hello@medplum.com) or [join our Discord](https://discord.gg/medplum).

:::

## Architecture Overview

### Components

| Component | Azure Service | Purpose |
|-----------|---------------|---------|
| Container Orchestration | Azure Kubernetes Service (AKS) | Runs Medplum server containers |
| Database | Azure Database for PostgreSQL Flexible Server | Primary data storage |
| Cache | Azure Cache for Redis | Session and cache storage |
| API Gateway | Azure Application Gateway | Ingress controller for API |
| CDN | Azure Front Door | Content delivery for frontend app |
| Secrets | Azure Key Vault | Configuration and secrets management |
| DNS | Azure DNS Zone | DNS hosting for your subdomain |
| Storage | Azure Blob Storage | Binary/file storage |

### Network Architecture

```
Internet
    │
    ├─── api.yourdomain.com ──► Application Gateway ──► AKS (Medplum Server)
    │                                                         │
    └─── app.yourdomain.com ──► Azure Front Door ──► Blob Storage
                                                              │
                                                    ┌─────────┴─────────┐
                                                    │                   │
                                              PostgreSQL            Redis
```

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) (v1.0+)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed and authenticated
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for Kubernetes management
- [Helm](https://helm.sh/docs/intro/install/) (v3+)
- An Azure subscription with billing enabled
- A domain name you control

## Deployment Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/medplum/medplum
cd medplum/terraform/azure/
```

### Step 2: Configure Terraform Variables

Create or modify `terraform.tfvars` with your configuration:

```hcl
# Azure configuration
location            = "eastus2"           # Your preferred Azure region
resource_group_name = "medplum-rg"        # Resource group name
environment         = "dev"               # Environment (dev, staging, prod)
deployment_id       = "1"                  # Unique deployment identifier

# Domain configuration
app_domain = "app.yourdomain.com"         # Frontend app domain

# Resource tags
tags = {
  Environment = "dev"
  Project     = "medplum"
  ManagedBy   = "terraform"
  Owner       = "your-team"
}
```

### Step 3: Initialize and Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review the deployment plan
terraform plan

# Apply the configuration (this takes 15-30 minutes)
terraform apply
```

### Step 4: Capture Terraform Outputs

After deployment, save these output values - you'll need them for subsequent steps:

```bash
# View all outputs
terraform output

# Get specific values
terraform output postgresql_password
terraform output redis_primary_key
```

Expected outputs:
```
api_ip = "20.xx.xx.xx"
cdn_endpoint = "medplum-endpoint.azurefd.net"
medplum_server_identity_client_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
medplum_server_identity_name = "medplum-dev-1-server"
oidc_issuer_url = "https://eastus2.oic.prod-aks.azure.com/..."
postgresql_dns_record = "medplum-dev-postgres.postgres.database.azure.com"
redis_hostname = "medplum-dev-redis.redis.cache.windows.net"
```

### Step 5: Create the Medplum Database

Connect to PostgreSQL and create the database with required extensions:

```bash
# Install psql if needed (macOS)
brew install libpq
brew link --force libpq

# Connect to PostgreSQL (you'll be prompted for password)
psql "host=<postgresql_dns_record> port=5432 dbname=postgres user=medplumadmin sslmode=require"
```

Run these SQL commands:

```sql
-- Create the medplum database
CREATE DATABASE medplum;

-- Connect to the new database
\c medplum

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Verify extensions
\dx

-- Exit
\q
```

### Step 6: Generate RSA Signing Key

Generate an RSA key pair for JWT signing:

```bash
# Generate private key
openssl genrsa -out medplum-key.pem 2048

# View the key (you'll need to copy this into your config)
cat medplum-key.pem
```

### Step 7: Create Key Vault Configuration Secret

Create a JSON configuration file (`medplum-config.json`):

```json
{
  "port": 8103,
  "baseUrl": "https://api.yourdomain.com/",
  "issuer": "https://api.yourdomain.com/",
  "audience": "https://api.yourdomain.com/",
  "jwksUrl": "https://api.yourdomain.com/.well-known/jwks.json",
  "authorizeUrl": "https://api.yourdomain.com/oauth2/authorize",
  "tokenUrl": "https://api.yourdomain.com/oauth2/token",
  "userInfoUrl": "https://api.yourdomain.com/oauth2/userinfo",
  "appBaseUrl": "https://app.yourdomain.com/",
  "binaryStorage": "azure:medplum-storage",
  "storageBaseUrl": "https://api.yourdomain.com/storage/",
  "supportEmail": "\"Your App\" <support@yourdomain.com>",
  "maxJsonSize": "1mb",
  "maxBatchSize": "50mb",
  "vmContextBotsEnabled": true,
  "defaultBotRuntimeVersion": "vmcontext",
  "allowedOrigins": "*",
  "introspectionEnabled": true,
  "database": {
    "host": "YOUR_POSTGRESQL_HOST",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplumadmin",
    "password": "YOUR_POSTGRESQL_PASSWORD",
    "ssl": {
      "rejectUnauthorized": true
    }
  },
  "redis": {
    "host": "YOUR_REDIS_HOST",
    "port": 6380,
    "password": "YOUR_REDIS_PASSWORD",
    "tls": {}
  },
  "signingKey": "-----BEGIN RSA PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END RSA PRIVATE KEY-----",
  "signingKeyId": "medplum-key-1",
  "bullmq": {
    "removeOnFail": { "count": 1 },
    "removeOnComplete": { "count": 1 }
  },
  "shutdownTimeoutMilliseconds": 30000,
  "chainedSearchWithReferenceTables": true
}
```

Replace the placeholder values:
- `YOUR_POSTGRESQL_HOST`: From terraform output `postgresql_dns_record`
- `YOUR_POSTGRESQL_PASSWORD`: From `terraform output postgresql_password`
- `YOUR_REDIS_HOST`: From terraform output `redis_hostname`
- `YOUR_REDIS_PASSWORD`: From `terraform output redis_primary_key`
- `YOUR_PRIVATE_KEY_HERE`: Contents of `medplum-key.pem` (replace newlines with `\n`)

Upload to Key Vault:

```bash
az keyvault secret set \
  --vault-name "YOUR_KEYVAULT_NAME" \
  --name "medplum-config" \
  --file "medplum-config.json"
```

### Step 8: Create Federated Identity Credential

This enables Azure Workload Identity for the Kubernetes service account:

```bash
# Get the OIDC issuer URL
OIDC_ISSUER=$(az aks show \
  --resource-group YOUR_RESOURCE_GROUP \
  --name YOUR_AKS_NAME \
  --query "oidcIssuerProfile.issuerUrl" -o tsv)

# Create the federated credential
az identity federated-credential create \
  --name "medplum-server-federated-cred" \
  --identity-name "YOUR_MANAGED_IDENTITY_NAME" \
  --resource-group "YOUR_RESOURCE_GROUP" \
  --issuer "$OIDC_ISSUER" \
  --subject "system:serviceaccount:medplum:medplum" \
  --audiences "api://AzureADTokenExchange"
```

Replace:
- `YOUR_RESOURCE_GROUP`: Your Azure resource group name
- `YOUR_AKS_NAME`: Your AKS cluster name
- `YOUR_MANAGED_IDENTITY_NAME`: From terraform output `medplum_server_identity_name`

### Step 9: Configure DNS

#### Option A: Using Azure DNS Zone (Recommended for Subdomains)

If you're using a subdomain (e.g., `azure.yourdomain.com`), delegate it to Azure DNS:

1. **Get Azure DNS nameservers:**
   ```bash
   az network dns zone show \
     --resource-group YOUR_RESOURCE_GROUP \
     --name azure.yourdomain.com \
     --query nameServers
   ```

2. **Add NS records at your domain registrar** pointing your subdomain to Azure's nameservers.

3. **Create DNS records in Azure:**
   ```bash
   # API domain - A record pointing to Application Gateway
   az network dns record-set a add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name api \
     --ipv4-address YOUR_API_IP

   # App domain - CNAME record pointing to Front Door
   az network dns record-set cname set-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name app \
     --cname YOUR_CDN_ENDPOINT
   ```

#### Option B: Using External DNS Provider

Add these records at your DNS provider:
- **A record**: `api.yourdomain.com` → Application Gateway IP (from terraform output `api_ip`)
- **CNAME record**: `app.yourdomain.com` → Front Door endpoint (from terraform output `cdn_endpoint`)

### Step 10: Configure Helm Values

Edit `charts/values.yaml`:

```yaml
global:
  cloudProvider: azure
  configSource:
    # IMPORTANT: Format is azure:<vault-name>.vault.azure.net:<secret-name>
    # Do NOT include https:// prefix
    type: 'azure:your-keyvault-name.vault.azure.net:medplum-config'

serviceAccount:
  annotations:
    azure.workload.identity/client-id: "YOUR_MANAGED_IDENTITY_CLIENT_ID"

namespace: medplum

deployment:
  replicaCount: 1
  image:
    repository: medplum/medplum-server
    tag: latest
  resources:
    requests:
      memory: '1Gi'
      cpu: '500m'
    limits:
      memory: '2Gi'
      cpu: '1000m'
  autoscaling:
    enabled: true

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 65532
  runAsGroup: 65532
  fsGroup: 65532
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 65532
  runAsGroup: 65532
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault

podDisruptionBudget:
  enabled: true
  minAvailable: 1

ingress:
  deploy: true
  domain: 'api.yourdomain.com'
  tlsSecretName: 'medplum-api-tls'  # Will be created by cert-manager
```

Replace:
- `your-keyvault-name`: Your Key Vault name (without `.vault.azure.net`)
- `YOUR_MANAGED_IDENTITY_CLIENT_ID`: From terraform output `medplum_server_identity_client_id`
- `api.yourdomain.com`: Your API domain

### Step 11: Connect to AKS and Deploy

```bash
# Get AKS credentials
az aks get-credentials \
  --resource-group YOUR_RESOURCE_GROUP \
  --name YOUR_AKS_NAME \
  --overwrite-existing

# Deploy with Helm
cd charts
helm install medplum-server . -n medplum --create-namespace -f values.yaml
```

### Step 12: Set Up TLS Certificates

#### For API Domain (Using cert-manager)

1. **Install cert-manager:**
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

   # Wait for cert-manager to be ready
   kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=300s
   ```

2. **Create ClusterIssuer for Let's Encrypt:**
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: your-email@yourdomain.com
       privateKeySecretRef:
         name: letsencrypt-prod-account-key
       solvers:
       - http01:
           ingress:
             class: azure-application-gateway
   EOF
   ```

3. **Add CAA record** (if using subdomain delegation):
   ```bash
   az network dns record-set caa add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name "@" \
     --flags 0 \
     --tag "issue" \
     --value "letsencrypt.org"
   ```

4. **Update Ingress with TLS:**
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: medplum
     namespace: medplum
     annotations:
       cert-manager.io/cluster-issuer: "letsencrypt-prod"
       appgw.ingress.kubernetes.io/ssl-redirect: "true"
   spec:
     ingressClassName: azure-application-gateway
     rules:
     - host: api.yourdomain.com
       http:
         paths:
         - backend:
             service:
               name: medplum-service
               port:
                 number: 80
           path: /
           pathType: Prefix
     tls:
     - hosts:
       - api.yourdomain.com
       secretName: medplum-api-tls
   EOF
   ```

#### For App Domain (Using Azure Front Door Managed Certificate)

Azure Front Door uses **DigiCert** (not Let's Encrypt) for managed certificates. You must add a CAA record authorizing DigiCert before the certificate can be provisioned.

1. **Add CAA record for DigiCert:**
   ```bash
   az network dns record-set caa add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name "@" \
     --flags 0 \
     --tag "issue" \
     --value "digicert.com"
   ```

2. **Add TXT record for domain validation:**

   Get the validation token from Azure:
   ```bash
   az afd custom-domain show \
     --resource-group YOUR_RESOURCE_GROUP \
     --profile-name YOUR_FRONTDOOR_PROFILE \
     --custom-domain-name YOUR_CUSTOM_DOMAIN_NAME \
     --query "validationProperties.validationToken" -o tsv
   ```

   Add the TXT record:
   ```bash
   az network dns record-set txt add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name "_dnsauth.app" \
     --value "YOUR_VALIDATION_TOKEN"
   ```

3. **Monitor certificate provisioning:**
   ```bash
   az afd custom-domain show \
     --resource-group YOUR_RESOURCE_GROUP \
     --profile-name YOUR_FRONTDOOR_PROFILE \
     --custom-domain-name YOUR_CUSTOM_DOMAIN_NAME \
     --query "{hostname:hostName, validationState:domainValidationState, deploymentStatus:deploymentStatus}" \
     -o table
   ```

   Status progression:
   - `Pending` → `Approved` → Certificate provisioning begins
   - `deploymentStatus: Succeeded` → HTTPS is ready

   This process can take 15-45 minutes.

### Step 13: Build and Deploy Frontend

The frontend app must be built with the correct API URL configured.

1. **Create environment file for Azure:**
   ```bash
   cd packages/app

   cat > .env.azure << 'EOF'
   MEDPLUM_BASE_URL=https://api.yourdomain.com/
   MEDPLUM_CLIENT_ID=
   GOOGLE_CLIENT_ID=
   RECAPTCHA_SITE_KEY=
   MEDPLUM_REGISTER_ENABLED=true
   EOF
   ```

2. **Build the app with Azure configuration:**
   ```bash
   # Backup local .env
   cp .env .env.backup

   # Use Azure configuration
   cp .env.azure .env

   # Install dependencies (if needed)
   cd ../.. && npm install && cd packages/app

   # Build
   npm run build

   # Restore local .env
   cp .env.backup .env
   ```

3. **Upload to Azure Storage:**
   ```bash
   az storage blob upload-batch \
     --account-name YOUR_STORAGE_ACCOUNT \
     --destination '$web' \
     --source dist/ \
     --overwrite \
     --auth-mode key
   ```

4. **Purge CDN cache** (so new files are served immediately):
   ```bash
   az afd endpoint purge \
     --resource-group YOUR_RESOURCE_GROUP \
     --profile-name YOUR_FRONTDOOR_PROFILE \
     --endpoint-name YOUR_ENDPOINT_NAME \
     --content-paths "/*"
   ```

### Step 14: Verify Deployment

```bash
# Check pod status
kubectl get pods -n medplum

# Check logs
kubectl logs -n medplum -l app=medplum-server --tail=100

# Test API health endpoint
curl https://api.yourdomain.com/healthcheck

# Test frontend
open https://app.yourdomain.com
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Key Vault Configuration Format Error

**Error:** `RestError: getaddrinfo ENOTFOUND https`

**Cause:** Incorrect format in `values.yaml` configSource

**Solution:** The format must be `azure:<vault-name>.vault.azure.net:<secret-name>` without `https://` prefix:
```yaml
# ❌ Wrong
type: 'azure:https://my-vault.vault.azure.net/:medplum-config'

# ✅ Correct
type: 'azure:my-vault.vault.azure.net:medplum-config'
```

#### 2. Workload Identity Authentication Failure

**Error:** `AADSTS70025: The client has no configured federated identity credentials`

**Cause:** Federated identity credential not created or misconfigured

**Solution:** Create the federated credential:
```bash
az identity federated-credential create \
  --name "medplum-server-federated-cred" \
  --identity-name "YOUR_MANAGED_IDENTITY_NAME" \
  --resource-group "YOUR_RESOURCE_GROUP" \
  --issuer "$OIDC_ISSUER" \
  --subject "system:serviceaccount:medplum:medplum" \
  --audiences "api://AzureADTokenExchange"
```

#### 3. Application Gateway TLS Policy Error

**Error:** `ApplicationGatewayDeprecatedTlsVersionUsedInSslPolicy`

**Cause:** Using deprecated TLS version

**Solution:** Add SSL policy to Application Gateway in Terraform:
```hcl
ssl_policy {
  policy_type = "Predefined"
  policy_name = "AppGwSslPolicy20220101"
}
```

#### 4. Let's Encrypt CAA Lookup Failure (API Certificate)

**Error:** `DNS problem: SERVFAIL looking up CAA for yourdomain.com`

**Cause:** Parent domain DNS issues or missing CAA record

**Solution:** Add CAA record to your Azure DNS zone:
```bash
az network dns record-set caa add-record \
  --resource-group YOUR_RESOURCE_GROUP \
  --zone-name azure.yourdomain.com \
  --record-set-name "@" \
  --flags 0 \
  --tag "issue" \
  --value "letsencrypt.org"
```

#### 5. Azure Front Door Certificate Stuck in Pending (App Certificate)

**Error:** `We found a CAA record for your custom domain that does not include DigiCert as an authorized Certificate Authority`

**Cause:** Azure Front Door uses DigiCert for managed certificates, but CAA record only allows Let's Encrypt

**Solution:** Add DigiCert to CAA records:
```bash
az network dns record-set caa add-record \
  --resource-group YOUR_RESOURCE_GROUP \
  --zone-name azure.yourdomain.com \
  --record-set-name "@" \
  --flags 0 \
  --tag "issue" \
  --value "digicert.com"
```

Then regenerate the validation token if needed:
```bash
az afd custom-domain regenerate-validation-token \
  --resource-group YOUR_RESOURCE_GROUP \
  --profile-name YOUR_FRONTDOOR_PROFILE \
  --custom-domain-name YOUR_CUSTOM_DOMAIN_NAME
```

**Note:** After regenerating, you must update the TXT record with the new validation token.

#### 6. Frontend Shows 404 on API Calls

**Error:** API calls return 404, requests going to `app.yourdomain.com` instead of `api.yourdomain.com`

**Cause:** Frontend was built with wrong `MEDPLUM_BASE_URL` (defaults to localhost)

**Solution:** Rebuild the frontend with correct API URL:
```bash
cd packages/app

# Create .env with correct API URL
echo "MEDPLUM_BASE_URL=https://api.yourdomain.com/" > .env

# Rebuild
npm run build

# Re-upload to Azure Storage
az storage blob upload-batch \
  --account-name YOUR_STORAGE_ACCOUNT \
  --destination '$web' \
  --source dist/ \
  --overwrite \
  --auth-mode key

# Purge CDN cache
az afd endpoint purge \
  --resource-group YOUR_RESOURCE_GROUP \
  --profile-name YOUR_FRONTDOOR_PROFILE \
  --endpoint-name YOUR_ENDPOINT_NAME \
  --content-paths "/*"
```

#### 7. PostgreSQL Connection Issues

**Error:** Connection timeout or authentication failure

**Solutions:**
- Verify firewall rules allow AKS subnet
- Confirm SSL is enabled in connection string
- Check password doesn't have special characters that need escaping in JSON

#### 8. Redis Connection Issues

**Error:** `ECONNREFUSED` or `NOAUTH`

**Solutions:**
- Azure Redis uses port 6380 for TLS (not 6379)
- Ensure `tls: {}` is in your Redis config
- Verify Redis password is correct

### Useful Commands

```bash
# View pod logs
kubectl logs -n medplum -l app=medplum-server -f

# Describe pod for events
kubectl describe pod -n medplum -l app=medplum-server

# Check certificate status
kubectl get certificate -n medplum
kubectl describe certificate medplum-api-tls -n medplum

# Check ingress status
kubectl get ingress -n medplum
kubectl describe ingress medplum -n medplum

# Restart deployment
kubectl rollout restart deployment/medplum-server -n medplum

# Check Key Vault access
az keyvault secret show --vault-name YOUR_VAULT --name medplum-config
```

## Clean Up

To destroy all resources:

```bash
# Delete Helm release
helm uninstall medplum-server -n medplum

# Delete namespace
kubectl delete namespace medplum

# Destroy Terraform resources
cd terraform/azure
terraform destroy
```

**Warning:** This permanently deletes all data including the database.

## References

- [Terraform Documentation](https://www.terraform.io/docs/)
- [Azure Documentation](https://docs.microsoft.com/en-us/azure/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Azure Workload Identity](https://azure.github.io/azure-workload-identity/)
