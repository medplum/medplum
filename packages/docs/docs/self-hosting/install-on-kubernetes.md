---
sidebar_position: 4
---

# Install on Kubernetes

This guide provides step-by-step instructions for deploying Medplum on any Kubernetes cluster using our official Helm chart. This approach is the recommended path for production deployments, as it leverages the full power of the Kubernetes ecosystem for scalability, high availability, and simplified management.

Using Medplum's Helm chart offers a cloud-agnostic and repeatable deployment process. It abstracts away the complexity of managing individual application components, providing a single artifact to deploy and manage Medplum's services. This guide covers how to configure the Helm chart to connect to your essential prerequisites, including an external PostgreSQL database, Redis instance, and S3-compatible object storage.

This installation method is ideal for organizations already using Kubernetes or those adopting a cloud-native strategy. It offers the flexibility to run Medplum on any major cloud provider or on-premise, integrating seamlessly into existing infrastructure-as-code and CI/CD pipelines.

## Prerequisites

- **Docker Desktop** https://docs.docker.com/desktop/
- **kubectl** https://kubernetes.io/docs/tasks/tools/
- **Helm** https://helm.sh/docs/intro/install/

## Setup PostgreSQL and Redis

Medplum uses **PostgreSQL** for its primary data store and **Redis** for caching and queues. For production deployments, you must provision these services separately. This provides the scalability, high availability, and data durability required for enterprise applications.

The specific method you use to set up these services is a decision that should align with your organization's own cloud architecture, security, and operational policies. For example:

- **On AWS**, you might use **Amazon RDS** for PostgreSQL and **Amazon ElastiCache** for Redis.
- **On GCP**, you might use **Cloud SQL** for PostgreSQL and **Memorystore** for Redis.
- **On Azure**, you might use **Azure Database for PostgreSQL** and **Azure Cache for Redis**.

This guide assumes you have already provisioned these services and have the necessary connection information. For detailed instructions on setting up these services on specific clouds, you can refer to our cloud-specific guides:

- [Install on AWS](/docs/self-hosting/install-on-aws)
- [Install on GCP](/docs/self-hosting/install-on-gcp)
- [Install on Azure](/docs/self-hosting/install-on-azure)

### Localhost Testing and Validation

For local development, testing, and validation, you can get up and running quickly using Docker Compose. The Medplum Git repository includes a `docker-compose.yml` file at the root.

To start PostgreSQL and Redis, simply run:

```bash
docker-compose up
```

This will automatically create and run the necessary containers, allowing you to quickly test your Medplum deployment without needing to manually provision external services.

## Setup the Helm Repository

To install Medplum using Helm, you first need to add the official Medplum Helm chart repository. This allows Helm to locate and download the charts required for your deployment.

First, add the Medplum Helm repository by running the following command:

```bash
helm repo add medplum https://charts.medplum.com
```

Next, run `helm repo update` to ensure you have the latest information about the charts in your repositories.

```bash
helm repo update
```

You can now use Helm to install Medplum from the newly added repository.

## Generate a default `values.yaml` file

Before you install Medplum, it's a good practice to generate and review the default configuration. This gives you a clear understanding of all available settings and their default values.

To generate a `values.yaml` file from the Medplum Helm chart, run the following command. This command inspects the chart in the repository and prints the default `values.yaml` to your terminal.

```bash
helm show values medplum/medplum
```

You can save this output to a file to use as a starting point for your own configuration:

```bash
helm show values medplum/medplum > values.yaml
```

You should then review `values.yaml` and modify it according to your needs. This is where you will input your database and Redis connection information, your public-facing domain, and other custom settings.

## Create a Kubernetes Namespace

Create the namespace where Medplum will be deployed. This isolates Medplum from other applications in your cluster, improving organization and security. The Helm chart cannot create this namespace on its own during a standard install.

```bash
kubectl create namespace medplum
```

## Run the Helm Install Command

With the namespace created and the `values.yaml` file configured, they can now run the `helm install` command to deploy Medplum into their cluster.

```bash
helm install medplum medplum/medplum --namespace medplum -f ./values.yaml
```
