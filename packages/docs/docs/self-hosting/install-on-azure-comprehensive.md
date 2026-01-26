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

| Component | Azure Service | Docker Image | Purpose |
|-----------|---------------|--------------|---------|
| API Server | Azure Kubernetes Service (AKS) | `medplum/medplum-server` | Runs Medplum API server |
| Frontend App | Azure Container Apps | `medplum/medplum-app` | Serves the React frontend |
| Database | Azure Database for PostgreSQL | - | Primary data storage |
| Cache | Azure Cache for Redis | - | Session and cache storage |
| API Gateway | Azure Application Gateway | - | Ingress controller for API |
| Secrets | Azure Key Vault | - | Configuration and secrets management |
| DNS | Azure DNS Zone | - | DNS hosting for your subdomain |
| Storage | Azure Blob Storage | - | Binary/file storage |

### Network Architecture

```mermaid
flowchart TD
    Internet((Internet))
    
    Internet -->|api.yourdomain.com| AppGW[Application Gateway]
    AppGW --> AKS[AKS<br/>medplum-server]
    AKS --> PostgreSQL[(PostgreSQL)]
    AKS --> Redis[(Redis)]
    
    Internet -->|app.yourdomain.com| ContainerApps[Azure Container Apps<br/>medplum-app]
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

# Get sensitive values
terraform output postgresql_password
terraform output redis_primary_key
```

Expected outputs (save these for later steps):
```
aks_cluster_name = "medplum-dev-1-aks"
api_ip = "20.xx.xx.xx"
key_vault_name = "medplum-dev-1-kv"
medplum_server_identity_client_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
medplum_server_identity_name = "medplum-dev-1-server"
oidc_issuer_url = "https://eastus2.oic.prod-aks.azure.com/..."
postgresql_dns_record = "medplum-dev-1-postgres.postgres.database.azure.com"
postgresql_password = <sensitive>
redis_hostname = "medplum-dev-1-redis.redis.cache.windows.net"
redis_primary_key = <sensitive>
storage_account_name = "medplumdev1sa"
```

### Variable Reference

Use this table to map terraform outputs to configuration values throughout the guide:

| Placeholder | Terraform Output | Example Value | Used In |
|-------------|------------------|---------------|---------|
| `YOUR_RESOURCE_GROUP` | (from tfvars) | `medplum-rg` | Steps 8, 9, 11, 12, 13 |
| `YOUR_LOCATION` | (from tfvars) | `eastus2` | Step 13 |
| `YOUR_AKS_NAME` | `aks_cluster_name` | `medplum-dev-1-aks` | Steps 8, 11 |
| `YOUR_KEYVAULT_NAME` | `key_vault_name` | `medplum-dev-1-kv` | Steps 7, 10 |
| `YOUR_API_IP` | `api_ip` | `20.xx.xx.xx` | Step 9 |
| `YOUR_MANAGED_IDENTITY_NAME` | `medplum_server_identity_name` | `medplum-dev-1-server` | Step 8 |
| `YOUR_MANAGED_IDENTITY_CLIENT_ID` | `medplum_server_identity_client_id` | `xxxxxxxx-xxxx-...` | Step 10 |
| `YOUR_POSTGRESQL_HOST` | `postgresql_dns_record` | `medplum-dev-1-postgres.postgres...` | Steps 5, 7 |
| `YOUR_POSTGRESQL_PASSWORD` | `postgresql_password` | (sensitive) | Steps 5, 7 |
| `YOUR_REDIS_HOST` | `redis_hostname` | `medplum-dev-1-redis.redis...` | Step 7 |
| `YOUR_REDIS_PASSWORD` | `redis_primary_key` | (sensitive) | Step 7 |
| `YOUR_STORAGE_ACCOUNT` | `storage_account_name` | `medplumdev1sa` | Step 7 (binaryStorage) |
| `azure.yourdomain.com` | (your DNS zone) | `azure.example.com` | Steps 9, 12, 13 |
| `api.yourdomain.com` | (your API domain) | `api.azure.example.com` | Steps 7, 10, 12, 13 |
| `app.yourdomain.com` | (your app domain) | `app.azure.example.com` | Steps 7, 13 |

### Step 5: Create the Medplum Database

Connect to PostgreSQL and create the database. The Medplum server will automatically create required extensions (`uuid-ossp`, `pg_trgm`, `btree_gin`) during its initial startup migrations.

```bash
# Install psql if needed (macOS)
brew install libpq
brew link --force libpq

# Connect to PostgreSQL (you'll be prompted for password)
psql "host=<postgresql_dns_record> port=5432 dbname=postgres user=medplumadmin sslmode=require"
```

Run this SQL command:

```sql
-- Create the medplum database
CREATE DATABASE medplum;

-- Exit
\q
```

**Verify:** Reconnect and confirm the database exists:
```bash
psql "host=<postgresql_dns_record> port=5432 dbname=medplum user=medplumadmin sslmode=require" -c "SELECT 1;"
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
  "binaryStorage": "azure:YOUR_STORAGE_ACCOUNT",
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

Replace the placeholder values (see Variable Reference table in Step 4):
- `YOUR_POSTGRESQL_HOST`: From terraform output `postgresql_dns_record`
- `YOUR_POSTGRESQL_PASSWORD`: From `terraform output postgresql_password`
- `YOUR_REDIS_HOST`: From terraform output `redis_hostname`
- `YOUR_REDIS_PASSWORD`: From `terraform output redis_primary_key`
- `YOUR_STORAGE_ACCOUNT`: From terraform output `storage_account_name`
- `YOUR_PRIVATE_KEY_HERE`: Contents of `medplum-key.pem` (replace newlines with `\n`)

Upload to Key Vault:

```bash
az keyvault secret set \
  --vault-name "YOUR_KEYVAULT_NAME" \
  --name "medplum-config" \
  --file "medplum-config.json"
```

**Verify:** Confirm the secret was uploaded:
```bash
az keyvault secret show --vault-name "YOUR_KEYVAULT_NAME" --name "medplum-config" --query "name" -o tsv
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
- `YOUR_AKS_NAME`: From terraform output `aks_cluster_name`
- `YOUR_MANAGED_IDENTITY_NAME`: From terraform output `medplum_server_identity_name`

**Verify:** Confirm the federated credential was created:
```bash
az identity federated-credential list \
  --identity-name "YOUR_MANAGED_IDENTITY_NAME" \
  --resource-group "YOUR_RESOURCE_GROUP" \
  --query "[].name" -o tsv
```

### Step 9: Configure API DNS

Set up DNS for the API domain. The app domain DNS will be configured in Step 13 after Container Apps is deployed.

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

3. **Create API DNS record:**
   ```bash
   # API domain - A record pointing to Application Gateway
   az network dns record-set a add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name api \
     --ipv4-address YOUR_API_IP
   ```

#### Option B: Using External DNS Provider

Add this record at your DNS provider:
- **A record**: `api.yourdomain.com` → Application Gateway IP (from terraform output `api_ip`)

**Verify:** Confirm DNS propagation:
```bash
nslookup api.yourdomain.com
```

### Step 10: Configure Helm Values

Create a custom values file or edit the default `charts/values.yaml`. You can also copy the example file:

```bash
cd medplum/charts
cp values-example-azure.yaml my-values.yaml
```

Edit your values file with your configuration:

```yaml
global:
  cloudProvider: azure
  configSource:
    # IMPORTANT: Format is azure:<vault-name>.vault.azure.net:<secret-name>
    # Do NOT include https:// prefix
    type: 'azure:your-keyvault-name.vault.azure.net:medplum-config'

serviceAccount:
  create: true
  annotations:
    azure.workload.identity/client-id: "YOUR_MANAGED_IDENTITY_CLIENT_ID"

namespace: medplum

deployment:
  replicaCount: 1
  image:
    repository: medplum/medplum-server
    tag: ""  # Uses Chart.appVersion by default
  resources:
    requests:
      memory: '1Gi'
      cpu: '500m'
    limits:
      memory: '2Gi'
      cpu: '1000m'
  autoscaling:
    enabled: true
    minReplicas: 1
    maxReplicas: 10
    targetCPUUtilizationPercentage: 80

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
  tlsSecretName: 'medplum-api-tls'
  # Enable cert-manager integration for automatic TLS certificates
  certManager:
    enabled: true
    clusterIssuer: 'letsencrypt-prod'
```

Replace:
- `your-keyvault-name`: Your Key Vault name (without `.vault.azure.net`)
- `YOUR_MANAGED_IDENTITY_CLIENT_ID`: From terraform output `medplum_server_identity_client_id`
- `api.yourdomain.com`: Your API domain

> **Note:** When `ingress.certManager.enabled` is `true`, the Helm chart automatically adds cert-manager annotations to the Ingress resource.

### Step 11: Connect to AKS and Deploy

```bash
# Get AKS credentials
az aks get-credentials \
  --resource-group YOUR_RESOURCE_GROUP \
  --name YOUR_AKS_NAME \
  --overwrite-existing

# Navigate to Helm chart directory (from repository root)
cd charts

# Deploy with Helm (use your custom values file)
helm install medplum-server . -n medplum --create-namespace -f my-values.yaml
```

**Verify:** Check that the pod is running:
```bash
kubectl get pods -n medplum
kubectl logs -n medplum -l app.kubernetes.io/name=medplum --tail=50
```

The pod may restart a few times initially while waiting for database migrations to complete.

### Step 12: Set Up API TLS Certificate

:::tip DNS Propagation
Before proceeding, ensure your DNS records from Step 9 have fully propagated. DNS propagation can take 5-30 minutes depending on your DNS provider. If cert-manager attempts certificate issuance before DNS propagates, it will fail the HTTP-01 challenge.

Verify with: `nslookup api.yourdomain.com` - it should return your Application Gateway IP.
:::

Use cert-manager to provision a Let's Encrypt certificate for the API domain.

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

   **Verify:** Check certificate provisioning (may take 2-5 minutes):
   ```bash
   kubectl get certificate -n medplum
   kubectl describe certificate medplum-api-tls -n medplum
   ```

   Wait until `READY` shows `True` before proceeding.

### Step 13: Deploy Frontend with Azure Container Apps

Deploy the Medplum frontend using the official Docker image. The `medplum/medplum-app` image supports runtime configuration via environment variables.

1. **Create Container Apps environment:**
   ```bash
   az containerapp env create \
     --name medplum-app-env \
     --resource-group YOUR_RESOURCE_GROUP \
     --location YOUR_LOCATION
   ```

2. **Deploy the frontend container:**
   ```bash
   az containerapp create \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --environment medplum-app-env \
     --image medplum/medplum-app:latest \
     --target-port 80 \
     --ingress external \
     --env-vars \
       MEDPLUM_BASE_URL=https://api.yourdomain.com/ \
       MEDPLUM_REGISTER_ENABLED=true
   ```

3. **Get the Container App FQDN:**
   ```bash
   CONTAINER_APP_FQDN=$(az containerapp show \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --query "properties.configuration.ingress.fqdn" -o tsv)

   echo "Container App FQDN: $CONTAINER_APP_FQDN"
   ```

   **Verify:** Test the container is running:
   ```bash
   curl -I "https://$CONTAINER_APP_FQDN"
   ```

4. **Configure app DNS records:**

   Add CNAME pointing to Container App:
   ```bash
   # For Azure DNS Zone:
   az network dns record-set cname set-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name app \
     --cname "$CONTAINER_APP_FQDN"

   # For external DNS: Add CNAME record app.yourdomain.com → $CONTAINER_APP_FQDN
   ```

   Add TXT record for domain verification:
   ```bash
   VERIFICATION_ID=$(az containerapp show \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --query 'properties.customDomainVerificationId' -o tsv)

   az network dns record-set txt add-record \
     --resource-group YOUR_RESOURCE_GROUP \
     --zone-name azure.yourdomain.com \
     --record-set-name "asuid.app" \
     --value "$VERIFICATION_ID"
   ```

5. **Add custom domain and managed certificate:**
   ```bash
   # Add custom domain
   az containerapp hostname add \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --hostname app.yourdomain.com

   # Bind managed certificate
   az containerapp hostname bind \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --hostname app.yourdomain.com \
     --environment medplum-app-env \
     --validation-method CNAME
   ```

   **Verify:** Check certificate status (takes 1-5 minutes):
   ```bash
   az containerapp hostname list \
     --name medplum-app \
     --resource-group YOUR_RESOURCE_GROUP \
     --query "[].{hostname:name, bindingType:bindingType}" -o table
   ```

### Step 14: Verify Deployment

```bash
# Check pod status
kubectl get pods -n medplum

# Check logs
kubectl logs -n medplum -l app.kubernetes.io/name=medplum --tail=100

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

#### 5. Frontend Shows 404 on API Calls

**Error:** API calls return 404, requests going to `app.yourdomain.com` instead of `api.yourdomain.com`

**Cause:** `MEDPLUM_BASE_URL` environment variable not set correctly in Container App

**Solution:** Update the Container App environment variable:
```bash
az containerapp update \
  --name medplum-app \
  --resource-group YOUR_RESOURCE_GROUP \
  --set-env-vars MEDPLUM_BASE_URL=https://api.yourdomain.com/
```

#### 6. PostgreSQL Connection Issues

**Error:** Connection timeout or authentication failure

**Solutions:**
- Verify firewall rules allow AKS subnet
- Confirm SSL is enabled in connection string
- Check password doesn't have special characters that need escaping in JSON

#### 7. Redis Connection Issues

**Error:** `ECONNREFUSED` or `NOAUTH`

**Solutions:**
- Azure Redis uses port 6380 for TLS (not 6379)
- Ensure `tls: {}` is in your Redis config
- Verify Redis password is correct

### Useful Commands

```bash
# View pod logs
kubectl logs -n medplum -l app.kubernetes.io/name=medplum -f

# Describe pod for events
kubectl describe pod -n medplum -l app.kubernetes.io/name=medplum

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
