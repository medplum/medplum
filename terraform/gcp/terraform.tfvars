
# GCP project
project_id = "medplum-zencore"
region     = "us-west1"


# Common enforced labels
labels = {
  env     = "prod"
  purpose = "gke"
  owner   = "medplum"
}

## VPC's
vpc_name = "medplum-gke-vpc"

