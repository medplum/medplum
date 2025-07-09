# This block serves as a technical illustration of configuring a Google Cloud Storage (GCS) backend for Terraform state management. 
# It demonstrates the structure and parameters required to define a GCS bucket as the remote backend, 
# which is essential for maintaining the state file in a centralized and secure manner.

# terraform {
#   backend "gcs" {
#     bucket = "example-terraform-state"
#     prefix = "terraform/medplum/gke"
#   }
# }