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

- [Install on AWS](https://www.google.com/search?q=https://www.medplum.com/docs/self-hosting/aws)
- [Install on GCP](https://www.google.com/search?q=https://www.medplum.com/docs/self-hosting/gcp)
- [Install on Azure](https://www.google.com/search?q=https://www.medplum.com/docs/self-hosting/azure)

### Localhost Testing and Validation

For local development, testing, and validation, you can get up and running quickly using Docker Compose. The Medplum Git repository includes a `docker-compose.yml` file at the root.

To start PostgreSQL and Redis, simply run:

```bash
docker-compose up
```

This will automatically create and run the necessary containers, allowing you to quickly test your Medplum deployment without needing to manually provision external services.

## Setup Ingress Controller

To expose your application to the internet, you'll need an **Ingress Controller** running in your Kubernetes cluster. An Ingress Controller is a specialized piece of software that acts as an entry point for all incoming traffic, routing it to the correct service within the cluster based on rules defined in an `Ingress` resource. Without one, your application won't be accessible from outside the cluster.

You have a few options when it comes to choosing an Ingress Controller:

### Cloud-Agnostic Option: Ingress-Nginx

We recommend using the **ingress-nginx** controller. It's a popular, open-source, and cloud-agnostic solution that is widely supported and well-documented. Its primary advantage is that it provides a consistent experience across different cloud providers and on-premise environments. By standardizing on `ingress-nginx`, you ensure your setup remains portable, making it easier to migrate between different cloud providers or use a hybrid cloud strategy.

### Cloud-Specific Options

Alternatively, you can choose to use the native Ingress controller provided by your cloud provider. These controllers are often deeply integrated with the cloud's ecosystem, offering features like managed load balancers, built-in security (WAF), and seamless integration with the cloud's certificate management service.

- **AWS**: The **AWS Load Balancer Controller** automatically provisions AWS Application Load Balancers (ALBs) or Network Load Balancers (NLBs) for your services.
- **GCP**: The **GKE Ingress** controller is a built-in, managed service that provisions a Google Cloud HTTP(S) Load Balancer for your application.
- **Azure**: The **Azure Application Gateway Ingress Controller (AGIC)** integrates your AKS cluster with an Azure Application Gateway.

For more detailed instructions and specific configurations for each of these options, please refer to our cloud-specific installation guides for AWS, GCP, and Azure.

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

Next, you should provide users with a clean, well-documented `values.yaml` file so they can see all configurable options. Helm provides a command for this exact purpose: `helm show values`.

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
