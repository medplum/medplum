provider "google" {
  project = var.project_id
  region  = "us-west1"
}

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0.0"
    }
  }
}