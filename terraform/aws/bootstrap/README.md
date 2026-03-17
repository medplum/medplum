# Bootstrap: Terraform Remote State Infrastructure

This one-time bootstrap module creates the S3 bucket and DynamoDB table that the main Medplum AWS module uses for remote state storage and locking. Run it once before enabling the backend block in `../backend.tf`.

```bash
cd terraform/aws/bootstrap
terraform init
terraform apply
```

After `apply` succeeds, copy the output bucket name into `../backend.tf`, uncomment the `backend "s3"` block, then run `terraform init` in `terraform/aws/`.
