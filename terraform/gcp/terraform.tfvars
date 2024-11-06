#  This file is used to define variable values for the Terraform configuration, 
# allowing customization of the infrastructure setup without modifying the main configuration files.

# GCP project configuration - Change these values to use your own project, region, and zone
project_id          = "your-project-id"          # e.g. "medplum-project"
region              = "your-region"              # e.g. "us-west1"
zone                = "your-zone"                # e.g. "us-west1-a"
static_asset_domain = "your-static-asset-domain" # e.g. "app.medplum.dev"
user_content_domain = "your-user-content-domain" # e.g. "storage.medplum.dev"


master_authorized_networks = [
  {
    cidr_block   = "[Your local network CIDR Block]/32"
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
  medplum-user-content = {
    location                 = "US"
    public_access_prevention = "enforced"
  },
  "medplum-static-assets" = {
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
  }
}

# Buckets bindings for public access
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