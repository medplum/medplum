
# GCP project
project_id = "medplum-zencore"
region     = "us-west1"
zone       = "us-west1-a"

services_api = [
  "compute.googleapis.com",
  "container.googleapis.com",
  "servicenetworking.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
]

# Common enforced labels
labels = {
  env     = "prod"
  purpose = "gke"
  owner   = "medplum"
}

## VPC's
vpc_name = "medplum-gke-vpc"

## Postgres
pg_ha_name = "medplum-pg-ha"

# Private Service
psa_range = "192.168.30.0/24"

## Buckets
gcs_buckets = {
  medplum-user-content = {
    project_id = "medplum-zencore"
    versioning = true
    lifecycle_rules = [{
      action = {
        type = "Delete"
      }
      condition = {
        is_live                    = "false"
        days_since_noncurrent_time = "7"
        num_newer_versions         = "2"
      }
    }]
  },
  "medplum-static-assets" = {
    project_id               = "medplum-zencore"
    location                 = "US"
    versioning               = true
    public_access_prevention = "inherited"
    website = {
      main_page_suffix = "index.html"
      not_found_page   = "404.html"
    }
    cors = [{
      origin          = ["*"]
      method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
      response_header = ["*"]
      max_age_seconds = 3600
    }]
    lifecycle_rules = [{
      action = {
        type = "Delete"
      }
      condition = {
        is_live                    = "false"
        days_since_noncurrent_time = "7"
        num_newer_versions         = "2"
      }
    }]
  }
}

# Buckets bindings
bucket_bindings = {
  "medplum-static-assets" = [ # This is the bucket name
    {
      roles = [
        "roles/storage.objectViewer",
      ]
      members = [
        "allUsers",
      ]
    },
  ],
}