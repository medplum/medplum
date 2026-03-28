# Medplum Helm Chart

The `medplum` chart is the standard way to deploy the Medplum FHIR server on Kubernetes. It supports AWS (EKS), GCP (GKE), and Azure (AKS).

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- A running cluster provisioned by one of the Terraform modules in `terraform/`

---

## Installation

### 1. Get the chart values

From the repo root:

```bash
helm show values ./charts > values-override.yaml
```

Edit `values-override.yaml` to match your environment. The sections below cover the required settings per cloud provider.

### 2. Deploy

```bash
helm install medplum ./charts \
  --namespace medplum \
  --create-namespace \
  --values values-override.yaml
```

### 3. Verify

```bash
kubectl -n medplum get pods
kubectl -n medplum get ingress
```

Pods should reach `Running` within a minute or two. On AWS and Azure the load balancer is pre-provisioned by Terraform — the ingress `ADDRESS` field should populate within 1–2 minutes as the controller registers target groups on the existing load balancer. On GCP the ingress controller provisions the Google Cloud Load Balancer from scratch, which may take 3–5 minutes.

---

## AWS (EKS)

These instructions assume you have already run `terraform apply` in `terraform/aws/`. Before proceeding, collect the Terraform outputs — run this from the `terraform/aws/` directory:

```bash
cd terraform/aws
terraform output
```

You will need these values to fill in the placeholders below:

| Terraform output | Placeholder used below |
|---|---|
| `cluster_name` | `<CLUSTER_NAME>` |
| `api_domain` | `<API_DOMAIN>` (e.g., `medplum-api.example.com`) |
| `ssm_config_path` | `<SSM_CONFIG_PATH>` (e.g., `/medplum-dev-1`) |
| `region` | `<AWS_REGION>` |
| `server_iam_role_arn` | `<SERVER_IAM_ROLE_ARN>` |
| `lb_controller_iam_role_arn` | `<LB_CONTROLLER_ROLE_ARN>` |
| `alb_certificate_arn` | `<ALB_CERTIFICATE_ARN>` |
| `alb_arn` | `<ALB_ARN>` |

### Install the AWS Load Balancer Controller

The ALB ingress requires the [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) to be running in the cluster. Install it once, substituting values from the Terraform outputs above:

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=<CLUSTER_NAME> \
  --set serviceAccount.create=true \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=<LB_CONTROLLER_ROLE_ARN>
```

### Configure values

Create `values-aws.yaml`, substituting each `<PLACEHOLDER>` with the corresponding value from the table above:

> **⚠️ CRITICAL — trailing slash required:**
> `configSource.type` **must** end with a `/`. Without it the server misparses SSM parameter
> names (leaving a leading `/` on every key) and fails to start with
> `Missing required config setting: baseUrl`.
>
> - Correct: `aws:region:/path/` ✓
> - Broken: `aws:region:/path` ✗ (server fails to start)

```yaml
global:
  cloudProvider: aws
  configSource:
    type: "aws:<AWS_REGION>:<SSM_CONFIG_PATH>/"

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: "<SERVER_IAM_ROLE_ARN>"

ingress:
  deploy: true
  domain: "<API_DOMAIN>"
  acmCertificateArn: "<ALB_CERTIFICATE_ARN>"
  albArn: "<ALB_ARN>"
```

Deploy:

```bash
helm install medplum ./charts \
  --namespace medplum \
  --create-namespace \
  --values values-aws.yaml
```

### Post-deploy DNS

The ALB DNS name is available immediately after `terraform apply` — no need to wait for the Ingress to be created:

```bash
terraform output alb_dns_name
# k8s-medplum-abc123.us-east-1.elb.amazonaws.com
```

If you are using Route 53 (`create_route53_zone = true` or `create_route53_records = true`), Terraform creates the `api_domain` alias record automatically and no manual step is needed.

If you are managing DNS externally, add this record at your DNS provider:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `<API_DOMAIN>` (e.g., `medplum-api.yourcompany.com`) | Value of `alb_dns_name` Terraform output |

### Deploy the frontend app

The frontend (S3 + CloudFront) is provisioned by Terraform, not Helm. The build and sync steps — including which bucket to use, how to set `MEDPLUM_BASE_URL`, and how to invalidate the CloudFront cache — are covered in the **"Deploy the static frontend to S3"** section of [`terraform/aws/README.md`](../terraform/aws/README.md).

---

## Troubleshooting (AWS)

### Pod is in `CrashLoopBackOff`

Check the logs first:

```bash
kubectl -n medplum logs -l app.kubernetes.io/name=medplum --previous
```

Common causes:

| Error in logs | Cause | Fix |
|---|---|---|
| `Missing required config setting: baseUrl` | `configSource.type` is missing the trailing `/` | Change `aws:region:/path` → `aws:region:/path/` in your values file and `helm upgrade` |
| `AccessDeniedException: not authorized to perform: ssm:GetParametersByPath` | IRSA role missing permission on the SSM path itself (not just children) | Verify `iam.tf` grants access to both `parameter/<prefix>` and `parameter/<prefix>/*` |
| `connect ECONNREFUSED 127.0.0.1:5432` | `DatabaseSecrets` SSM parameter points to a secret that lacks `host`/`port`/`dbname` | Verify the secret ARN in SSM contains all connection fields including `password` |

### Ingress `ADDRESS` stays blank

The ALB is provisioned by Terraform — the LB Controller's job is to adopt it and register target groups and listener rules. If `ADDRESS` never populates, check the controller logs:

```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=aws-load-balancer-controller
```

Common causes:

| Error / symptom | Cause | Fix |
|---|---|---|
| `ingress.albArn` not set in values | Controller creates a **new** ALB instead of adopting the Terraform one — or fails if it lacks `CreateLoadBalancer` permission | Set `ingress.albArn` to the value of `terraform output alb_arn` and `helm upgrade` |
| `InvalidLoadBalancerArn` or `LoadBalancerNotFound` | Wrong or stale ARN supplied | Re-run `terraform output alb_arn` and update `ingress.albArn` |
| `AccessDenied: not authorized to perform: elasticloadbalancing:DescribeLoadBalancers` | IAM policy uses wrong action prefix | Must be `elasticloadbalancing:*`, not `elbv2:*` — verify `iam.tf` |
| `no matches for kind "IngressClass"` | LB Controller is not installed or installed in the wrong namespace | Re-run the `helm install aws-load-balancer-controller` step |

### `kubectl` returns `the server has asked for the client to provide credentials`

Your kubeconfig is missing or stale. Re-run:

```bash
aws eks update-kubeconfig \
  --region <AWS_REGION> \
  --name <CLUSTER_NAME>
```

### Frontend shows `Access Denied` / blank page

Possible causes:

1. **Wrong S3 bucket** — the frontend must be synced to `static_storage_name` (served by CloudFront), not `app_storage_name` (used for server binary uploads). Re-sync to the correct bucket and invalidate.
2. **Missing bucket policy** — if you provisioned the bucket manually before running `terraform apply`, the CloudFront OAC bucket policy may not have been applied. Run `terraform apply` to reconcile.
3. **SPA routing** — navigating directly to any path other than `/` will 403 at S3. The CloudFront distribution must have custom error responses mapping 403 and 404 → `/index.html` (HTTP 200). This is configured automatically by `cdn.tf`.

---

These instructions assume you have already run `terraform apply` in `terraform/gcp/`.

### Configure values

```yaml
global:
  cloudProvider: gcp
  configSource:
    # Format: gcp:<project-id>:<secret-id>
    type: "gcp:my-project-id:medplum-config"

serviceAccount:
  annotations:
    # GCP Workload Identity — format: <sa-name>@<project-id>.iam.gserviceaccount.com
    iam.gke.io/gcp-service-account: "medplum-server@my-project-id.iam.gserviceaccount.com"

ingress:
  deploy: true
  domain: "medplum.yourcompany.com"
```

Deploy:

```bash
helm install medplum ./charts \
  --namespace medplum \
  --create-namespace \
  --values values-gcp.yaml
```

---

## Azure (AKS)

These instructions assume you have already run `terraform apply` in `terraform/azure/`.

### Configure values

```yaml
global:
  cloudProvider: azure
  configSource:
    # Format: azure:<key-vault-url>:<secret-name>
    type: "azure:https://medplum-vault.vault.azure.net/:medplum-config"

serviceAccount:
  annotations:
    # Azure Workload Identity — use the managed identity client ID
    azure.workload.identity/client-id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

ingress:
  deploy: true
  domain: "medplum.yourcompany.com"
  # TLS secret created by cert-manager or pre-imported into the cluster
  tlsSecretName: "medplum-tls"
```

Deploy:

```bash
helm install medplum ./charts \
  --namespace medplum \
  --create-namespace \
  --values values-azure.yaml
```

---

## Key Configuration Options

| Value | Default | Description |
|---|---|---|
| `global.cloudProvider` | `aws` | Cloud provider: `aws`, `gcp`, or `azure` |
| `global.configSource.type` | `env` | Config source. Prefix: `aws:`, `gcp:`, `azure:`, `file:`, or `env` |
| `deployment.image.tag` | chart `appVersion` | Medplum server image tag |
| `deployment.replicaCount` | `1` | Number of server replicas (ignored when autoscaling is on) |
| `deployment.autoscaling.enabled` | `true` | Enable horizontal pod autoscaling |
| `deployment.resources.requests.memory` | `1Gi` | Memory request per pod |
| `deployment.resources.limits.memory` | `2Gi` | Memory limit per pod |
| `ingress.deploy` | `true` | Whether to create an Ingress resource |
| `ingress.domain` | `""` | Hostname for the ingress rule |
| `ingress.acmCertificateArn` | `""` | AWS only: ACM cert ARN for the ALB HTTPS listener |
| `ingress.albArn` | `""` | AWS only: ARN of the Terraform-provisioned ALB (`alb_arn` output). The LB Controller adopts this ALB instead of creating a new one |
| `ingress.tlsSecretName` | `""` | Azure only: Kubernetes TLS secret name |
| `serviceAccount.annotations` | `{}` | Workload identity annotations (IRSA, GKE WI, Azure WI) |

For the full list of available values:

```bash
helm show values ./charts
```

---

## Upgrading

```bash
helm upgrade medplum ./charts \
  --namespace medplum \
  --values values-override.yaml
```

## Uninstalling

```bash
helm uninstall medplum --namespace medplum
```

---

## References

- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [EKS IRSA documentation](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Azure Workload Identity](https://azure.github.io/azure-workload-identity/docs/)
