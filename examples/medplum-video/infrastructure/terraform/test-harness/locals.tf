locals {
  name_prefix = "${var.environment}-test-harness"

  domain_name = "${var.domain_prefix}.${trimsuffix(data.aws_route53_zone.main.name, ".")}"

  common_tags = {
    Project     = "medplum-video"
    Component   = "test-harness"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # Shared network/compute plumbing from the livekit module.
  vpc_id            = data.terraform_remote_state.livekit.outputs.vpc_id
  public_subnet_ids = data.terraform_remote_state.livekit.outputs.public_subnet_ids
  ecs_cluster_arn   = data.terraform_remote_state.livekit.outputs.ecs_cluster_arn

  image_uri = (
    var.image != ""
    ? var.image
    : "${aws_ecr_repository.test_harness.repository_url}:${var.image_tag}"
  )

  # Env vars injected into the running nginx container; entrypoint.sh turns
  # these into /config.js so the SPA picks them up at runtime.
  container_env = [
    { name = "MEDPLUM_BASE_URL", value = var.medplum_base_url },
    { name = "GENERATE_TOKEN_BOT_ID", value = var.generate_token_bot_id },
    { name = "ADMIT_PATIENT_BOT_ID", value = var.admit_patient_bot_id },
    { name = "START_ADHOC_VISIT_BOT_ID", value = var.start_adhoc_visit_bot_id },
    { name = "DEFAULT_PATIENT_ID", value = var.default_patient_id },
    { name = "DEFAULT_PRACTITIONER_ID", value = var.default_practitioner_id },
    { name = "ENVIRONMENT_LABEL", value = var.environment_label },
  ]
}
