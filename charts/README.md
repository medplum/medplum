# Medplum Helm Chart

The `medplum` chart deploys the Medplum Server on Kubernetes. Medplum is an open-source healthcare development platform providing a FHIR server, authentication, workflows, and APIs for building healthcare applications.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8.0+
- A configured database (Azure Database for PostgreSQL or Cloud SQL)
- A configured cache (Azure Cache for Redis or Cloud Memorystore)
- Cloud provider credentials configured (GCP Workload Identity or Azure Workload Identity)

## Supported Cloud Providers

| Provider | Status | Documentation |
|----------|--------|---------------|
| Azure (AKS) | ✅ Supported | [Install on Azure](https://www.medplum.com/docs/self-hosting/install-on-azure-comprehensive) |
| GCP (GKE) | ✅ Supported | [Install on GCP](https://www.medplum.com/docs/self-hosting/install-on-gcp) |
| AWS (EKS) | ⚠️ Use CDK | [Install on AWS](https://www.medplum.com/docs/self-hosting/install-on-aws) |

## Installation

### Option 1: From Medplum Helm Repository

```bash
helm repo add medplum https://charts.medplum.com
helm repo update

# Generate a local values file
helm show values medplum/medplum > values.yaml

# Edit values.yaml to customize your deployment
# Then install
helm install medplum-server medplum/medplum -f values.yaml --namespace medplum --create-namespace
```

### Option 2: From Source

```bash
git clone https://github.com/medplum/medplum
cd medplum/charts

# Copy and customize the example values file
cp values-example-azure.yaml my-values.yaml
# Edit my-values.yaml with your configuration

helm install medplum-server . -n medplum --create-namespace -f my-values.yaml
```

## Configuration

### Global Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.cloudProvider` | Cloud provider (`gcp` or `azure`) | `azure` |
| `global.configSource.type` | Configuration source for Medplum server | `azure:your-keyvault-name.vault.azure.net:medplum-config` |

### Configuration Source Formats

The `global.configSource.type` parameter tells the Medplum server where to fetch its runtime configuration:

| Provider | Format | Example |
|----------|--------|---------|
| Environment | `env` | `env` |
| AWS Parameter Store | `aws:<region>:<parameter-name>` | `aws:us-east-1:medplum-config` |
| GCP Secret Manager | `gcp:<project-id>:<secret-id>` | `gcp:my-project:medplum-config` |
| Azure Key Vault | `azure:<vault-name>.vault.azure.net:<secret-name>` | `azure:my-vault.vault.azure.net:medplum-config` |

> **Important for Azure**: Do NOT include `https://` prefix in the vault URL.

### Service Account

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create a service account | `true` |
| `serviceAccount.name` | Service account name | `""` (uses release fullname) |
| `serviceAccount.annotations` | Service account annotations | See values.yaml |

#### GCP Workload Identity

```yaml
serviceAccount:
  annotations:
    iam.gke.io/gcp-service-account: "medplum-server@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

#### Azure Workload Identity

```yaml
serviceAccount:
  annotations:
    azure.workload.identity/client-id: "YOUR_MANAGED_IDENTITY_CLIENT_ID"
```

### Deployment

| Parameter | Description | Default |
|-----------|-------------|---------|
| `deployment.replicaCount` | Number of replicas | `1` |
| `deployment.image.repository` | Container image repository | `medplum/medplum-server` |
| `deployment.image.tag` | Container image tag | `""` (uses Chart.appVersion) |
| `deployment.resources.requests.memory` | Memory request | `1Gi` |
| `deployment.resources.requests.cpu` | CPU request | `500m` |
| `deployment.resources.limits.memory` | Memory limit | `2Gi` |
| `deployment.resources.limits.cpu` | CPU limit | `1000m` |
| `deployment.autoscaling.enabled` | Enable HPA | `true` |
| `deployment.autoscaling.minReplicas` | Minimum replicas | `1` |
| `deployment.autoscaling.maxReplicas` | Maximum replicas | `10` |

### Ingress

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.deploy` | Deploy ingress resource | `true` |
| `ingress.domain` | API domain name | `api.yourdomain.com` |
| `ingress.tlsSecretName` | TLS secret name | `medplum-api-tls` |
| `ingress.certManager.enabled` | Enable cert-manager integration (Azure) | `false` |
| `ingress.certManager.clusterIssuer` | cert-manager ClusterIssuer name | `letsencrypt-prod` |

### Security

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podSecurityContext.runAsNonRoot` | Run as non-root user | `true` |
| `podSecurityContext.runAsUser` | User ID | `65532` |
| `securityContext.readOnlyRootFilesystem` | Read-only root filesystem | `true` |
| `securityContext.allowPrivilegeEscalation` | Allow privilege escalation | `false` |

### Pod Disruption Budget

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podDisruptionBudget.enabled` | Enable PDB | `true` |
| `podDisruptionBudget.minAvailable` | Minimum available pods | `1` |

## Example Configurations

### Azure AKS

See `values-example-azure.yaml` for a complete Azure example.

```yaml
global:
  cloudProvider: azure
  configSource:
    type: 'azure:my-keyvault.vault.azure.net:medplum-config'

serviceAccount:
  annotations:
    azure.workload.identity/client-id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

ingress:
  domain: 'api.medplum.example.com'
  certManager:
    enabled: true
    clusterIssuer: 'letsencrypt-prod'
```

### GCP GKE

```yaml
global:
  cloudProvider: gcp
  configSource:
    type: 'gcp:my-project-id:medplum-config'

serviceAccount:
  annotations:
    iam.gke.io/gcp-service-account: "medplum-server@my-project-id.iam.gserviceaccount.com"

ingress:
  domain: 'api.medplum.example.com'
```

## Upgrading

```bash
helm upgrade medplum-server medplum/medplum -f values.yaml -n medplum
```

## Uninstalling

```bash
helm uninstall medplum-server -n medplum
kubectl delete namespace medplum
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n medplum
kubectl describe pod -n medplum -l app.kubernetes.io/name=medplum
```

### View Logs

```bash
kubectl logs -n medplum -l app.kubernetes.io/name=medplum -f
```

### Check Ingress

```bash
kubectl get ingress -n medplum
kubectl describe ingress -n medplum
```

### Check Certificate (cert-manager)

```bash
kubectl get certificate -n medplum
kubectl describe certificate medplum-api-tls -n medplum
```

## References

- [Medplum Documentation](https://www.medplum.com/docs)
- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/)
- [Azure Workload Identity](https://azure.github.io/azure-workload-identity/)
- [GCP Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
