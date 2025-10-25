---
sidebar_position: 1
---

# Self-hosting Medplum

Medplum is an open source healthcare development platform that you can deploy in your own environment. This guide provides detailed instructions for self-hosting Medplum across various infrastructure options.

These guides are designed for DevOps engineers and system administrators who have experience managing production healthcare systems.

:::warning Considerations
Thinking about self-hosting? Take a look at our [self-hosting vs. cloud guide](./considerations.md) to help you decide if self-hosting is for you. 
:::

## Installation Options

### [Install on AWS](/docs/self-hosting/install-on-aws) (Recommended)

Deploy Medplum on Amazon Web Services using our industrial-strength AWS CDK and CloudFormation templates. This deployment option, which we use for our own hosted service, provides enterprise-grade scalability with automated setup of VPCs, ECS clusters, load balancers, and other critical infrastructure components.

### [Install on Ubuntu](/docs/self-hosting/install-on-ubuntu)

Deploy Medplum directly on Ubuntu servers using our official APT repository ([apt.medplum.com](https://apt.medplum.com/)). This production-ready configuration offers a streamlined installation process while maintaining full control over your infrastructure.

### [Install on GCP](/docs/self-hosting/install-on-gcp) (Beta)

Deploy Medplum on Google Cloud Platform using our Terraform configurations. While in beta, this deployment option has been validated with production workloads and provides a robust foundation for GCP-based implementations.

### [Install on Azure](/docs/self-hosting/install-on-azure) (Beta)

Deploy Medplum on Azure using our Terraform configurations. While in beta, this deployment option has been validated with production workloads and provides a robust foundation for Azure-based implementations.

### [Install from Scratch](/docs/self-hosting/install-from-scratch)

Learn how to build and deploy Medplum from source code on bare metal infrastructure. This option provides an in-depth understanding of Medplum's architecture and components, making it ideal for educational purposes or custom deployments.

## Additional Resources

- Explore [self-hosting articles](/blog/tags/self-host) on the Medplum blog
- Track [self-hosting features and improvements](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aself-host) on GitHub
