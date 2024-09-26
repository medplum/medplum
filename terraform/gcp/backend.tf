terraform {
  backend "gcs" {
    bucket = "medplum-terraform-state"
    prefix = "terraform/medplum/gke"
  }
}