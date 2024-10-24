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
