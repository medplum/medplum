#  This file is used to define variable values for the Terraform configuration, 
# allowing customization of the infrastructure setup without modifying the main configuration files.

# GCP project configuration - Change these values to use your own project, region, and zone
project_id          = "medplum-zencore"             # "your-project-id"
region              = "us-west1"                    # "your-region"
zone                = "us-west1-a"                  # "your-zone"
static_asset_domain = "app.zencore.medplum.dev"     # "your-static-asset-domain"
user_content_domain = "storage.zencore.medplum.dev" # "your-user-content-domain"

# Common enforced labels - Change these values to use your own labels
labels = {
  env     = "your-environment" # e.g., "dev", "staging", "prod"
  purpose = "your-purpose"     # e.g., "gke", "web", "database"
  owner   = "your-owner"       # e.g., "team-name", "project-owner"
}

## Buckets configuration 
gcs_buckets = {
  medplum-user-content = {
    project_id = "medplum-zencore"
    location   = "US"
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
      not_found_page   = "index.html"
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