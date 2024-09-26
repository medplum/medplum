
# GCP project
project_id = "medplum-zencore"
region     = "us-west1"
zone       = "us-west1-a"

services_api = [
  "compute.googleapis.com",
  "container.googleapis.com",
  # "sql-component.googleapis.com",
  # "sqladmin.googleapis.com",
  # "servicenetworking.googleapis.com",
  # "logging.googleapis.com",
  # "monitoring.googleapis.com",
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

