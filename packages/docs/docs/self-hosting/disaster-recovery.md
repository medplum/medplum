---
sidebar_position: 204
---

# Disaster Recovery

This document outlines a high-level approach to disaster recovery for a self-hosted Medplum instance deployed across various infrastructure options, including cloud providers (AWS, GCP, Azure) and Kubernetes. It is intended as a foundational overview to facilitate discussions and planning, rather than a detailed step-by-step runbook.

## Introduction

Disaster recovery (DR) is a critical aspect of maintaining highly available and resilient systems. For Medplum deployments, a DR strategy focuses on minimizing downtime and data loss in the event of a significant outage, such as a cloud region failure or a data center disruption. Our approach leverages common principles of data persistence, infrastructure automation, and traffic management available across different hosting environments.

## Key Principles of Medplum Disaster Recovery

The Medplum architecture, when self-hosted, inherently supports several key principles that are fundamental to an effective disaster recovery strategy:

1. **Data Persistence and Backups:** Medplum primarily relies on a PostgreSQL database for its data. Regardless of your hosting environment, robust backup and snapshot strategies for your database are crucial for point-in-time recovery and restoring data in a new environment. This could involve using managed database services (e.g., AWS RDS, Azure SQL Database, GCP Cloud SQL) with their automated backup features, or implementing your own backup solutions for self-managed databases.
2. **Infrastructure as Code (IaC):** Medplum deployments are designed to be reproducible. By defining your infrastructure (e.g., compute instances, container orchestration clusters like ECS or Kubernetes, networking) as code (e.g., using AWS CloudFormation, Terraform, Azure Resource Manager, GCP Deployment Manager), you can rapidly provision a new environment in a different cloud region, availability zone, or data center.
3. **Stateless Application Tier:** The Medplum application servers are largely stateless. This means they can be easily scaled up, down, or replaced without losing critical session or transaction data, as all persistent data resides in the database. This characteristic greatly simplifies recovery efforts.
4. **Traffic Management:** DNS (Domain Name System) or load balancer configurations are used to route user traffic to your Medplum instance. In a disaster scenario, updates to these configurations can redirect traffic to a newly recovered environment.

## High-Level Recovery Steps

In the event of a significant outage (e.g., a cloud region going down, or a primary data center becoming unavailable) requiring a full recovery in a new location, the recovery process would generally involve the following high-level steps:

1. **Restore Database from Snapshot/Backup:**
   - Identify the last available, healthy snapshot or backup of your PostgreSQL database.
   - Launch a new PostgreSQL instance in the target recovery region, availability zone, or data center from this snapshot/backup. This will restore your Medplum data to the point in time of the backup. Examples include restoring an AWS RDS snapshot, an Azure SQL Database point-in-time restore, or deploying a new PostgreSQL instance from a logical backup on a Kubernetes cluster.
   - _Estimated Time: 15 minutes_
2. **Provision New Application Infrastructure:**
   - Using your existing Infrastructure as Code (IaC) templates, deploy a new Medplum application stack and associated resources (e.g., VPCs/VNets, subnets, load balancers, security groups, compute instances, container orchestration clusters) in the target recovery location.
   - Crucially, configure this new application stack to connect to the newly restored database instance. Ensure all necessary environment variables and secrets (e.g., database connection strings, API keys) are correctly configured for the new environment.
   - _Estimated Time: 15 minutes_
3. **Update Traffic Routing:**
   - Once the new Medplum application stack is fully operational and connected to the restored database, update your DNS records (e.g., in AWS Route 53, Azure DNS, GCP Cloud DNS) or load balancer configurations to point your Medplum domain (e.g., app.yourcompany.com) to the entry point of the newly provisioned application stack.
   - DNS propagation time will influence the overall recovery time objective (RTO).
   - _Estimated Time: 15 minutes_

Total Estimated Time: 45 minutes to 1 hour

## Important Considerations and Next Steps

While the above provides a high-level framework, a comprehensive disaster recovery plan involves several additional considerations:

- **Recovery Time Objective (RTO) and Recovery Point Objective (RPO):** Define clear RTO (maximum acceptable downtime) and RPO (maximum acceptable data loss) targets. These targets will influence the specific technologies and strategies chosen (e.g., cross-region replication vs. snapshot restore, active-passive vs. active-active setups).
- **Non-Database Data:** Consider recovery strategies for any non-database persistent data, such as object storage used for file storage (e.g., patient documents, media). Cloud providers offer cross-region replication for services like AWS S3, Azure Blob Storage, or GCP Cloud Storage. For bare-metal, ensure your storage solution has a robust replication or backup strategy.
- **Secrets Management:** Ensure your secrets management strategy (e.g., AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault for Kubernetes) is robust and accessible in the recovery location.
- **Monitoring and Alerting:** Implement comprehensive monitoring to detect outages and alerting to notify relevant teams immediately, regardless of your hosting environment.
- **Regular Testing:** Periodically test your disaster recovery plan. This includes tabletop exercises and, ideally, actual failover drills to identify gaps and refine procedures.
- **Application-Level Recovery:** Consider any application-specific recovery steps or data synchronization needs beyond the core database.
- **Cost Implications:** Understand the cost implications of maintaining a disaster recovery environment (e.g., warm standby vs. cold standby, cross-region data transfer costs).

## Conclusion

This document provides a high-level overview of disaster recovery for self-hosted Medplum, focusing on the core principles and steps applicable across various hosting environments. It serves as a starting point for deeper discussions and the development of a more detailed, customer-specific disaster recovery plan. We are ready to collaborate further to tailor this strategy to your specific organizational requirements and compliance needs.
