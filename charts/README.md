# Medplum Helm Chart

The `medplum` chart is the standard way to deploy the Medplum FHIR server on Kubernetes. It supports AWS (EKS), GCP (GKE), and Azure (AKS).

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- A running cluster provisioned by one of the Terraform modules in `terraform/`

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
| `api_waf_arn` | `<API_WAF_ARN>` (null when `enable_waf = false`) |
| `external_dns_iam_role_arn` | `<EXTERNAL_DNS_ROLE_ARN>` (when `dns.enabled = true`) |
| `app_domain` | `<APP_DOMAIN>` — used as `dns.appDomain` |
| `cdn_domain_name` | `<CDN_DOMAIN_NAME>` — used as `dns.cloudFrontDomain` |
| `ses_verification_token` | `<SES_VERIFICATION_TOKEN>` — used as `dns.sesVerificationToken` |
| `ses_dkim_tokens` | list of 3 tokens — used as `dns.sesDkimTokens` |
| `storage_cdn_domain_name` | `<STORAGE_CDN_DOMAIN_NAME>` — used as `dns.storageCdnDomain` (null when no storage CDN) |
| `storage_domain` | `<STORAGE_DOMAIN>` — used as `dns.storageDomain` (null when no storage CDN) |

### Configure kubectl

Update your local kubeconfig to point at the new cluster (substitute `<CLUSTER_NAME>` and `<AWS_REGION>` from the table above):

```bash
aws eks update-kubeconfig \
  --region <AWS_REGION> \
  --name <CLUSTER_NAME>
```

Verify the nodes are ready before proceeding:

```bash
kubectl get nodes
# NAME                          STATUS   ROLES    AGE
# ip-10-52-x-x.ca-central-1... Ready    <none>   2m
```

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
  wafAclArn: "<API_WAF_ARN>"   # terraform output api_waf_arn
```

Deploy:

```bash
helm install medplum ./charts \
  --namespace medplum \
  --create-namespace \
  --values values-aws.yaml
```

Pods reach `Running` in 1–2 minutes; the ALB takes 2–3 minutes to provision. Once `kubectl -n medplum get ingress` shows an `ADDRESS`, DNS is automatically updated by external-dns if `dns.enabled = true`.

### DNS setup with external-dns (AWS)

external-dns must be installed as a **standalone release** before upgrading the medplum chart. This ensures the `DNSEndpoint` CRD is registered in the cluster before the medplum chart tries to create `DNSEndpoint` resources.

**Prerequisites:** the Route 53 hosted zone must already exist and the ACM certificates must be issued before running `terraform apply`.

**Step 1 — Create the Route 53 hosted zone**

Terraform does not create the hosted zone. Create it once with the AWS CLI:

```bash
# Create the zone (e.g. for a subdomain deployment)
ZONE_ID=$(aws route53 create-hosted-zone \
  --name <YOUR_ZONE_NAME> \
  --caller-reference "medplum-$(date +%s)" \
  --query 'HostedZone.Id' --output text | cut -d/ -f3)

echo "Zone ID: $ZONE_ID"   # save this — you'll need it for dns.zoneId

# Get the 4 NS records assigned to your new zone
aws route53 list-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --query "ResourceRecordSets[?Type=='NS'].ResourceRecords[].Value" \
  --output text
```

If `<YOUR_ZONE_NAME>` is a subdomain (e.g. `staging.example.com`) and the parent zone (`example.com`) is also in Route 53 in this account, add NS delegation so traffic resolves correctly. Replace `<PARENT_ZONE_ID>` and the four NS values with your actual values:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id <PARENT_ZONE_ID> \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "<YOUR_ZONE_NAME>.",
        "Type": "NS",
        "TTL": 300,
        "ResourceRecords": [
          {"Value": "ns-XXX.awsdns-XX.com."},
          {"Value": "ns-XXX.awsdns-XX.co.uk."},
          {"Value": "ns-XXX.awsdns-XX.net."},
          {"Value": "ns-XXX.awsdns-XX.org."}
        ]
      }
    }]
  }'
```

If the parent zone is managed externally (Cloudflare, GoDaddy, etc.), add the four NS records there instead.

**Step 2 — Install external-dns standalone**

> **Important:** you must pass both `--source ingress` and `--source crd`. Without `--source crd`, external-dns will only process Ingress resources and silently ignore the `DNSEndpoint` objects the medplum chart creates for CloudFront and SES records.

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update

helm install external-dns external-dns/external-dns \
  --namespace kube-system \
  --set provider.name=aws \
  --set "domainFilters[0]=<YOUR_ZONE_NAME>" \
  --set policy=sync \
  --set registry=txt \
  --set txtOwnerId=<DEPLOYMENT_ID> \
  --set "sources[0]=ingress" \
  --set "sources[1]=crd" \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=<EXTERNAL_DNS_ROLE_ARN>
```

Where `<DEPLOYMENT_ID>` is your `environment`-`deployment_id` string (e.g. `medplum-dev-1`, matching the `environment` and `deployment_id` variables in `terraform.tfvars`). This is used as the TXT ownership prefix so multiple clusters don't fight over the same records. It does not come from `terraform output` — read it directly from your `terraform.tfvars`.

Wait for the CRD to register before proceeding:

```bash
kubectl wait --for condition=established crd/dnsendpoints.externaldns.k8s.io --timeout=60s
```

**Step 3 — Populate `dns.*` values from `terraform output`**

| Terraform output | Helm value |
|---|---|
| `external_dns_iam_role_arn` | `dns.iamRoleArn` (used in Step 2 above) |
| `app_domain` | `dns.appDomain` |
| `cdn_domain_name` | `dns.cloudFrontDomain` |
| `storage_domain` | `dns.storageDomain` (when storage CDN enabled) |
| `storage_cdn_domain_name` | `dns.storageCdnDomain` (when storage CDN enabled) |
| `ses_verification_token` | `dns.sesVerificationToken` |
| `ses_dkim_tokens` | `dns.sesDkimTokens` |

Add to your `values-aws.yaml`:

```yaml
dns:
  enabled: true
  zoneId: "<ZONE_ID from Step 1>"
  iamRoleArn: "<external_dns_iam_role_arn>"
  appDomain: "<app_domain>"             # terraform output app_domain
  cloudFrontDomain: "<cdn_domain_name>" # terraform output cdn_domain_name
  sesVerificationToken: "<ses_verification_token>"
  sesDkimTokens:
    - "<token1>"   # terraform output ses_dkim_tokens (index 0)
    - "<token2>"   # terraform output ses_dkim_tokens (index 1)
    - "<token3>"   # terraform output ses_dkim_tokens (index 2)
  # storageDomain: "<storage_domain>"             # terraform output storage_domain
  # storageCdnDomain: "<storage_cdn_domain_name>" # terraform output storage_cdn_domain_name
```

**Step 4 — Install or upgrade medplum**

```bash
helm upgrade medplum ./charts -n medplum --values values-aws.yaml
```

external-dns reconciles all Route 53 records within ~30 seconds. Verify:

```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=external-dns | tail -20
```

If the logs show `All records are already up to date` but your DNS records are missing, external-dns was installed without `--source crd`. Re-run the `helm upgrade external-dns` command in Step 2 with both sources set, then wait for the next reconcile cycle.

### Deploy the bot Lambda layer (one-time)

Medplum bots run as AWS Lambda functions and require a shared Lambda layer (`medplum-bot-layer`) to be published in your account before any bot can be deployed or executed. This is a **one-time per-cluster step** — all bots share the same layer.

Check whether the layer already exists:

```bash
aws lambda list-layer-versions \
  --layer-name medplum-bot-layer \
  --region <AWS_REGION>
```

If the output is empty or returns an error, publish the layer from the repo root:

```bash
cd /path/to/medplum
AWS_REGION=<AWS_REGION> bash scripts/deploy-bot-layer.sh
```

This bundles `packages/bot-layer/` dependencies into a zip and publishes it to Lambda as `medplum-bot-layer`. The command takes 2–3 minutes (npm install is the slow part). On success, AWS returns a `LayerVersionArn` confirming the layer is ready.

> **Bot deployment order:** save code in UI → click **Deploy** (publishes the Lambda function using the layer) → click **Execute** (invokes it). Skipping **Deploy** results in `Function not found` errors.

### Deploy the frontend app

Frontend deployment (S3 + CloudFront) is covered in [`terraform/aws/README.md`](../terraform/aws/README.md).

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

The LB Controller owns the ALB lifecycle. If `ADDRESS` never populates, check the controller logs:

```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=aws-load-balancer-controller
```

Common causes:

| Error / symptom | Cause | Fix |
|---|---|---|
| `AccessDenied: not authorized to perform: elasticloadbalancing:CreateLoadBalancer` | IAM policy is missing `elasticloadbalancing:*` | Verify `iam.tf` grants the LB Controller role the required permissions |
| `AccessDenied: not authorized to perform: elasticloadbalancing:DescribeLoadBalancers` | IAM policy uses wrong action prefix | Must be `elasticloadbalancing:*`, not `elbv2:*` — verify `iam.tf` |
| `no matches for kind "IngressClass"` | LB Controller is not installed or installed in the wrong namespace | Re-run the `helm install aws-load-balancer-controller` step |

### DNS records not appearing / external-dns logs say "All records are already up to date"

external-dns was installed without the `--source crd` flag, so it watches only Ingress objects and silently ignores `DNSEndpoint` custom resources. The ALB alias record will exist, but CloudFront, SES, and DKIM records will not be created.

Fix by upgrading the external-dns release with both sources:

```bash
helm upgrade external-dns external-dns/external-dns \
  --namespace kube-system \
  --reuse-values \
  --set "sources[0]=ingress" \
  --set "sources[1]=crd"
```

Then wait ~30 seconds for the next reconcile cycle and verify:

```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=external-dns | tail -20
kubectl get dnsendpoints -A
```

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

## GCP (GKE)

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

Verify: `kubectl -n medplum get pods` and `kubectl -n medplum get ingress`. The Google Cloud Load Balancer may take 3–5 minutes to provision.

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

Verify: `kubectl -n medplum get pods` and `kubectl -n medplum get ingress`. The load balancer `ADDRESS` should populate within 1–2 minutes.

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
| `ingress.wafAclArn` | `""` | AWS only: ARN of the regional WAFv2 Web ACL (`api_waf_arn` output). The LB Controller attaches this WAF to the ALB it creates |
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
