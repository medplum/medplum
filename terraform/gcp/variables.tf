variable "region" {
  description = "The GCP region where resources will be created."
  type        = string
}
variable "zone" {
  description = "The GCP zone where resources will be created."
  type        = string

}
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}
variable "services_api" {
  description = "A list of GCP services to enable"
  type        = list(string)
  default = [
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "container.googleapis.com",
    "servicenetworking.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com"
  ]
}
variable "labels" {
  description = "A map of common enforced labels"
  type        = map(string)
  default = {
    env     = ""
    purpose = ""
    owner   = ""
  }
}

# VPC
variable "vpc_name" {
  description = "The name for the VPC"
  type        = string
  default     = "medplum-gke-vpc"
}

## Postgres
variable "pg_ha_name" {
  description = "The name for the HA Postgres instance"
  type        = string
  default     = "medplum-pg-ha"
}

# Private Service
variable "psa_range_name" {
  description = "name of the private allocated range"
  type        = string
  default     = "priv-ip-alloc"
}

## Buckets
variable "gcs_buckets" {
  description = "GCS buckets to be created"
  type = map(object({
    project_id = string
    location   = optional(string)
    # Configuration of the bucket's custom location in a dual-region bucket setup.
    custom_placement_config = optional(object({
      data_locations = list(string)
    }))
    force_destroy            = optional(bool, false)
    bucket_policy_only       = optional(bool, true)
    public_access_prevention = optional(string, "enforced")
    storage_class            = optional(string, "STANDARD")
    versioning               = optional(bool, false)
    autoclass                = optional(bool, false)
    log_bucket               = optional(string)

    iam_members = optional(list(object({
      role   = string
      member = string
    })), [])

    lifecycle_rules = optional(list(object({
      # See https://github.com/terraform-google-modules/terraform-google-cloud-storage/blob/master/modules/simple_bucket/main.tf#L75-L96
      action    = map(any)
      condition = map(any)
    })), [])

    retention_policy = optional(object({
      is_locked        = bool
      retention_period = number
    }))

    website = optional(map(any), {})
    cors = optional(list(object({
      origin          = list(string)
      method          = list(string)
      response_header = list(string)
      max_age_seconds = number
    })), [])

    labels = optional(map(string), {})
  }))
  default = {}
}

# Buckets bindings
variable "bucket_bindings" {
  description = "Bucket level permissions"
  type = map(list(object({
    roles   = list(string)
    members = list(string)
  })))
}
