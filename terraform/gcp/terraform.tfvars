
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

##Subnets
subnets = [
  {
    subnet_name           = "medplum-us-west1-sn-gke-01"
    subnet_ip             = "10.0.0.0/20"
    subnet_region         = "us-west1"
    subnet_private_access = "true"
    subnet_flow_logs      = "true"
  },
]

secondary_ranges = {
  medplum-us-west1-sn-gke-01 = [
    {
      range_name    = "medplum-gke-pods"
      ip_cidr_range = "10.4.0.0/14"
    },
    {
      range_name    = "medplum-gke-services"
      ip_cidr_range = "10.8.0.0/20"
    },
  ],
}
