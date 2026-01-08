# This resource block enables specific Google Cloud Platform (GCP) services for the project defined by `var.project_id`.
# It iterates over the list of services provided in the `var.services_api` variable, enabling each service for the project.
# Usage:
# - Ensure that the `project_id` variable is set to the desired GCP project ID.
# - Define the `services_api` variable with a list of GCP services you wish to enable, such as "compute.googleapis.com" or "container.googleapis.com".
# - Apply the Terraform configuration to enable the specified services for the project.
# - The `timeouts` block specifies the maximum duration for creating and updating services, which can be adjusted as needed.
# - The `disable_on_destroy` and `disable_dependent_services` flags are set to false to prevent disabling services when the resource is destroyed.

resource "google_project_service" "project" {
  project = var.project_id

  for_each = toset(var.services_api)
  service  = each.key

  timeouts {
    create = "30m"
    update = "40m"
  }

  disable_on_destroy         = false
  disable_dependent_services = false
}
