# Medplum Helm Charts

The `medplum` chart is the best way to operate Medplum on Kubernetes.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8.0+

## Installation

Setup the Medplum Helm repository:

```bash
helm repo add medplum https://charts.medplum.com
helm repo update
```

Generate a local `values.yaml` file:

```bash
helm show values medplum/medplum > values.yaml
```

Edit `values.yaml` to customize your Medplum deployment.

TODO: Document the available configuration options.

Install the Medplum chart:

```bash
helm install medplum medplum/medplum -f values.yaml --namespace medplum --create-namespace
```

## References

- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/)
- [GitLab Chart](https://gitlab.com/gitlab-org/charts/gitlab)
- [Bitnami WordPress Chart](https://github.com/bitnami/charts/tree/main/bitnami/wordpress)
- [Jenkins Helm Chart](https://github.com/jenkinsci/helm-charts/tree/main/charts/jenkins)
