# ---------------------------------------------------------------------------
# SSM Parameter Store
#
# livekit_config  – plain YAML (non-sensitive).  The entrypoint.sh writes this
#                   to /tmp/livekit.yaml before starting the server.
#
# livekit_keys    – SecureString: "api-key:api-secret".  Passed to
#                   livekit-server via the --keys flag.
#
# Both parameters are injected into the ECS task as container "secrets" which
# means ECS resolves them before the container starts – the values never
# appear in task definition logs or environment snapshots as plain text.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "livekit_config" {
  name        = "/${var.environment}/livekit/config"
  description = "LiveKit server configuration YAML (non-sensitive)"
  type        = "String"
  value       = local.livekit_config_yaml
}

resource "aws_ssm_parameter" "livekit_keys" {
  name        = "/${var.environment}/livekit/keys"
  description = "LiveKit API credentials in 'key:secret' format (SecureString)"
  type        = "SecureString"
  # LiveKit --keys flag requires "key: secret" format (space after colon).
  value       = "${var.livekit_api_key}: ${var.livekit_api_secret}"

  lifecycle {
    # Prevent accidental overwrites of rotated credentials.
    ignore_changes = [value]
  }
}
