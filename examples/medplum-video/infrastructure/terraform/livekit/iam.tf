# ---------------------------------------------------------------------------
# IAM roles are NOT managed as Terraform resources here because the SSO
# credential set used for deployment lacks iam:TagRole and iam:ListRolePolicies,
# which the AWS provider calls on every plan/apply/destroy cycle.
#
# The roles are instead pre-created by `make iam-bootstrap` (AWS CLI) and
# referenced here as read-only data sources.  This requires only iam:GetRole.
#
# To create / recreate the roles:
#   make iam-bootstrap ENV=dev PROFILE=medplum
# ---------------------------------------------------------------------------

data "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-task-execution"
}

data "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-task"
}
