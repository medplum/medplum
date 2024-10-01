provider "google" {
  project = var.project_id
  region  = "us-west1"
}

provider "google-beta" {
  project = var.project_id
  region  = "us-west1"
}


terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.74.0, < 7"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 4.74.0, < 7"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.10"
    }
  }
}