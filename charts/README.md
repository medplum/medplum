# Medplum Helm Chart

Cloud-neutral chart for the Medplum server. Runs on GKE, AKS, EKS, or any
conformant Kubernetes: every cloud-specific setting — ingress class and
annotations, workload-identity annotations, config source, TLS — arrives as
a plain value. No template branches on a cloud provider.

## Install

```bash
helm repo add medplum https://charts.medplum.com
helm repo update
helm show values medplum/medplum > my-values.yaml   # edit
helm install medplum medplum/medplum -n medplum --create-namespace -f my-values.yaml
helm test medplum -n medplum
```

First boot runs the database schema migration and seed; pods sit
`0/1 Running` for several minutes before Ready. `helm test` waits for that.

## Key values

| Value | Purpose |
|---|---|
| `global.configSource.type` | Comma-separated server config sources, loaded left to right, later wins. `env` (default), or a cloud secret store layered under env: `aws:<region>:<param>,env`, `gcp:<project>:<secret>,env`, `azure:<vault-host>:<secret>,env`. |
| `config.server.*`, `config.database.*`, `config.redis.*` | Rendered as `MEDPLUM_*` env vars. **Empty values are not rendered**, so a chart default can never override a value from your secret store (env is the last, winning source). Env-only installs must set database/redis explicitly. |
| `config.redis.tls` | Object, JSON-encoded into `MEDPLUM_REDIS_TLS`: `{}` = TLS with a public CA, `{ca: "<pem>"}` = private CA (e.g. Memorystore). |
| `serviceAccount.{create,name,annotations,automount}` | Put your cloud's workload-identity annotation in `annotations` (`iam.gke.io/gcp-service-account`, `azure.workload.identity/client-id`, `eks.amazonaws.com/role-arn`). |
| `podLabels`, `podAnnotations` | e.g. `azure.workload.identity/use: "true"`. |
| `ingress.{enabled,className,annotations,host,tls}` | A standard Ingress for any controller. Off by default; `host` is required when enabled. |
| `service.annotations` | Cloud load-balancer / backend annotations (e.g. GKE NEG). |
| `extraObjects` | Additional manifests rendered verbatim through `tpl` — cloud-native ingress companions, ClusterIssuers, NetworkPolicies. |
| `deployment.image.tag` | Pin the server release explicitly; the chart's `appVersion` is only the default. |
| `deployment.autoscaling.*` | HPA with real defaults; a CPU target always renders, memory only when set. |

Full reference: `values.yaml` (annotated) and `values.schema.json`
(validated at install time).

## Cloud examples

- **GKE, cloud-native ingress** (GCE class, Google-managed certificate,
  Cloud Armor, CDN, HTTPS redirect): `examples/gke-cloud-native.values.yaml`.
  These objects were rendered by earlier charts from `global.cloudProvider=gcp`
  with hardcoded names; the example reproduces them with the same names so
  `helm upgrade` adopts them in place.
- **Any cluster, ingress-nginx + cert-manager**: `ingress.className: nginx`,
  `ingress.annotations: {cert-manager.io/cluster-issuer: letsencrypt}`,
  `ingress.tls: [{secretName: medplum-api-tls, hosts: [<host>]}]`, and the
  ClusterIssuer in `extraObjects`.

## Upgrading from charts before the cloud-neutral release

This is a breaking chart change; the app is unchanged. (Chart versions track
the app version, so it ships under the next release number rather than a
major bump — check `global.cloudProvider` in your values to know whether it
applies to you.)

- **`global.cloudProvider` is deprecated.** A compatibility shim
  (`_helpers.tpl`) still honors it and the legacy `ingress.deploy` /
  `ingress.domain` / `ingress.tlsSecretName` for one minor cycle, printing
  the replacement values in `NOTES.txt` on install. Set the explicit
  values it implied, then remove it.
- **GKE `BackendConfig` / `FrontendConfig` / `ManagedCertificate` are no
  longer templates.** Pass `examples/gke-cloud-native.values.yaml` (or your
  own `extraObjects`) — same names, in-place adoption.
- **Connection defaults removed.** `database.*` and `redis.*` no longer
  default to `localhost`/`medplum`; they must be set, or come from your
  configSource. This is what makes a cloud secret store safe to layer under
  env.
- **`namespace` value removed**; resources render into the release
  namespace (`-n`).
- **`ingress.enabled` defaults to `false`** (was `ingress.deploy: true`).

## Development

```bash
helm lint . && helm template test . -f examples/gke-cloud-native.values.yaml
```
