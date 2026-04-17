# ---------------------------------------------------------------------------
# IAM - same pattern as the livekit module.
# Roles are pre-created by `make iam-bootstrap MODULE=test-harness ENV=dev`
# (via AWS CLI) and referenced here as read-only data sources so the SSO
# credential set doesn't need iam:TagRole / iam:ListRolePolicies.
# ---------------------------------------------------------------------------

data "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-task-execution"
}

data "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-task"
}
