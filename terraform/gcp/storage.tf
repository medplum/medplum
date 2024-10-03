module "gcs_buckets" {
  source          = "terraform-google-modules/cloud-storage/google"
  version         = "~> 6.1"
  project_id      = var.project_id
  names           = ["app-backend"]
  prefix          = "medplum-gcs"
  set_admin_roles = true
  admins          = ["serviceAccount:medplum-app-sa@medplum-zencore.iam.gserviceaccount.com"]
  versioning = {
    first = true
  }
  bucket_admins = {
    second = "serviceAccount:medplum-app-sa@medplum-zencore.iam.gserviceaccount.com"
  }
}