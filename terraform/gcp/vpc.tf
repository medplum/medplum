module "vpc" {
  source  = "terraform-google-modules/network/google"
  version = "~> 9.2.0"

  project_id   = var.project_id
  network_name = var.vpc_name

  subnets = [
    {
      subnet_name   = "medplum-us-west1-sn-gke-01"
      subnet_ip     = "10.0.0.0/20"
      subnet_region = var.region
    },
    {
      subnet_name              = "medplum-us-west1-sn-psa-01"
      subnet_ip                = "192.168.32.0/20"
      subnet_region            = var.region
      private_ip_google_access = true
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
    ]
  }
  depends_on = [google_project_service.project]
}
