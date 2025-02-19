#  This file is used to define variable values for the Terraform configuration, 
# allowing customization of the infrastructure setup without modifying the main configuration files.

# GCP project configuration - Change these values to use your own project, domains, region, and zone

project_id     = "your-project-id"          # e.g. "medplum-project"
region         = "your-region"              # e.g. "us-west1"
zone           = "your-zone"                # e.g. "us-west1-a"
app_domain     = "your-static-asset-domain" # e.g. "app.medplum.dev"
storage_domain = "your-user-content-domain" # e.g. "storage.medplum.dev"

# GKE Cluster configuration - local network CIDR block should be replaced with your own to be able to access the GKE master nodes

master_authorized_networks = [
  {
    # cidr_block   = "[Your local network CIDR Block]/32"
    display_name = "Local Network"
  },
]

# Common enforced labels - Change these values to use your own labels
labels = {
  env     = "your-environment" # e.g., "dev", "staging", "prod"
  purpose = "your-purpose"     # e.g., "gke", "web", "database"
  owner   = "your-owner"       # e.g., "team-name", "project-owner"
}


## Default Buckets configuration
gcs_buckets = {
  medplum-storage = { # Bucket name
    location                 = "US"
    public_access_prevention = "enforced"
  },
  medplum-app = { # Bucket name
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