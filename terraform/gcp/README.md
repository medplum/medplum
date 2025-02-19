# Terraform GCP Deployment

This repository contains Terraform configurations for deploying a Google Cloud Platform (GCP) infrastructure. The setup includes a Virtual Private Cloud (VPC), Cloud SQL, Cloud Storage Buckets, Redis, and more.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) installed on your local machine.
- A GCP account with the necessary permissions to create resources.
- A GCP project where the resources will be deployed.
- Google Cloud SDK installed and authenticated with your GCP account.

## Deployment Steps

1. **Clone the Repository**

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Configure Backend (Optional)**

   If you want to use a remote backend for storing the Terraform state, uncomment and configure the `backend.tf` file.

3. **Initialize Terraform**

   Initialize the Terraform working directory, which will download the necessary provider plugins and modules.

   ```bash
   terraform init
   ```

4. **Plan the Deployment**

   Generate and review an execution plan to ensure the configuration is correct.

   ```bash
   terraform plan
   ```

5. **Apply the Configuration**

   Apply the Terraform configuration to create the resources in GCP.

   ```bash
   terraform apply
   ```

6. **Destroy the Infrastructure (Optional)**

   If you need to tear down the infrastructure, use the following command:

   ```bash
   terraform destroy
   ```

## Module Overview

### VPC Module

- **Path**: `terraform/gcp/network.tf`
- **Description**: Creates a Virtual Private Cloud (VPC) with subnets and secondary IP ranges. It also sets up private service access and network peering.

### Cloud SQL Module

- **Path**: `terraform/gcp/cloud-sql.tf`
- **Description**: Configures a PostgreSQL database instance with private IP configuration, backup settings, and custom database flags.

### Redis Module

- **Path**: `terraform/gcp/redis.tf`
- **Description**: Sets up a Redis instance using Memorystore with private service access and RDB persistence.

### Storage Buckets Module

- **Path**: `terraform/gcp/bucket-iam.tf`
- **Description**: Manages IAM bindings for Google Cloud Storage buckets to control access permissions.

### Service Accounts Module

- **Path**: `terraform/gcp/service-accounts.tf`
- **Description**: Creates service accounts and assigns specific roles for accessing GCP services like Redis and Cloud SQL.

## Variables

The configuration uses several variables defined in `variables.tf` and `terraform.tfvars`. Ensure these are set correctly for your environment.

## Outputs

The configuration outputs sensitive information like the SQL database password, which is marked as sensitive in `outputs.tf`.

## Notes

- Ensure that the GCP project ID and other variables are correctly set in `terraform.tfvars`.
- Review the IAM roles and permissions to ensure they align with your security policies.

For any issues or questions, please refer to the [Terraform documentation](https://www.terraform.io/docs/index.html) or the [GCP documentation](https://cloud.google.com/docs).