# Medplum Infrastructure

This directory contains infrastructure as code (IaC) configurations for deploying Medplum services.

## Structure

The infrastructure is divided into two main components:

### terraform/

Contains Terraform modules for cloud infrastructure across different providers:

- `medplum-server`: Core backend infrastructure including:
- Kubernetes cluster
- Database
- Redis cache
- Storage accounts for binary data
- Associated networking and security

- `medplum-app`: Static web application infrastructure including:
- Storage/bucket for static files
- CDN configuration
- Domain setup

Available for multiple cloud providers:

- AWS
- Azure
- GCP

### charts/

Helm charts for deploying the Medplum server application into Kubernetes clusters. These charts are used after the cloud infrastructure is provisioned by Terraform.

## Deployment Flow

### Backend (Server)

1. Use Terraform to create cloud infrastructure (`medplum-server`)
2. Use Helm charts to deploy the application into the Kubernetes cluster

### Frontend (App)

1. Use Terraform to create static hosting infrastructure (`medplum-app`)
2. Deploy built React application directly to cloud storage

No Helm charts needed (not Kubernetes-based)

## Usage

Each module includes its own README with specific configuration and deployment instructions.

For detailed documentation, see:

- [Server Infrastructure](terraform/azure/medplum-server/README.md)
- [App Infrastructure](terraform/azure/medplum-app/README.md)
- [Server Application Deployment](charts/README.md)
