# This module creates Google Cloud Storage buckets based on the configuration provided in the `gcs_buckets` variable.
# Each bucket is configured with properties such as location, storage class, and lifecycle rules.
# To use this module, define the desired bucket configurations in the `gcs_buckets` variable in `variables.tf`.
# Ensure that the `project_id` and other required properties are specified for each bucket.
# Apply the Terraform configuration to create and manage the specified GCS buckets.

module "buckets" {
  for_each = var.gcs_buckets

  source  = "terraform-google-modules/cloud-storage/google//modules/simple_bucket"
  version = "~> 6.1"

  name                     = each.key
  project_id               = var.project_id
  location                 = each.value.location
  custom_placement_config  = each.value.custom_placement_config
  force_destroy            = each.value.force_destroy
  bucket_policy_only       = each.value.bucket_policy_only
  public_access_prevention = each.value.public_access_prevention
  storage_class            = each.value.storage_class
  autoclass                = each.value.autoclass
  versioning               = each.value.versioning
  log_bucket               = each.value.log_bucket
  lifecycle_rules          = each.value.lifecycle_rules
  website                  = each.value.website
  cors                     = each.value.cors
  retention_policy         = each.value.retention_policy
  iam_members              = each.value.iam_members
  labels                   = merge(var.labels, each.value.labels)
}