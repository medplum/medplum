# ---------------------------------------------------------------------------
# SSM Parameter Store - Medplum client secret.
#
# The client secret IS exposed to the browser (baked into /config.js at
# container start) since the patient page uses it for auto-auth on shared
# devices - so it is only "sensitive" insofar as we avoid writing it into
# Terraform state in plaintext.  Storing it as a SecureString parameter
# keeps it encrypted in state and lets ECS resolve it as a container secret
# rather than a plain env var.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "medplum_client_secret" {
  name        = "/${var.environment}/test-harness/medplum-client-secret"
  description = "Medplum client credentials secret used by the hosted test-harness."
  type        = "SecureString"
  value       = var.medplum_client_secret
}

resource "aws_ssm_parameter" "medplum_client_id" {
  name        = "/${var.environment}/test-harness/medplum-client-id"
  description = "Medplum client credentials ID used by the hosted test-harness."
  type        = "SecureString"
  value       = var.medplum_client_id
}
