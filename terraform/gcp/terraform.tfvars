#  This file is used to define variable values for the Terraform configuration, 
# allowing customization of the infrastructure setup without modifying the main configuration files.

# GCP project configuration - Change these values to use your own project, region, and zone
project_id     = "medplum-zencore"             # e.g. "medplum-project"
region         = "us-west1"                    # e.g. "us-west1"
zone           = "us-west1-a"                  # e.g. "us-west1-a"
app_domain     = "app.zencore.medplum.dev"     # e.g. "app.medplum.dev"
storage_domain = "storage.zencore.medplum.dev" # e.g. "storage.medplum.dev"

# project_id     = "your-project-id"          # e.g. "medplum-project"
# region         = "your-region"              # e.g. "us-west1"
# zone           = "your-zone"                # e.g. "us-west1-a"
# app_domain     = "your-static-asset-domain" # e.g. "app.medplum.dev"
# storage_domain = "your-user-content-domain" # e.g. "storage.medplum.dev"

master_authorized_networks = [
  {
    # cidr_block   = "[Your local network CIDR Block]/32"
    cidr_block   = "190.244.75.217/32"
    display_name = "Local Network"
  },
]

# Common enforced labels - Change these values to use your own labels
labels = {
  env     = "your-environment" # e.g., "dev", "staging", "prod"
  purpose = "your-purpose"     # e.g., "gke", "web", "database"
  owner   = "your-owner"       # e.g., "team-name", "project-owner"
}

## Buckets configuration 
gcs_buckets = {
  medplum-storage-01 = {
    location                 = "US"
    public_access_prevention = "enforced"
  },
  medplum-app-01 = {
    location = "US"
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
    iam_members = [{
      role   = "roles/storage.objectViewer"
      member = "allUsers"
    }]
  }
}