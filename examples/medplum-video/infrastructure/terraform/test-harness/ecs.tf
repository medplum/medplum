# ---------------------------------------------------------------------------
# NOTE: This module does NOT create its own ECS cluster - it attaches the
# test-harness service to the shared cluster provisioned by the livekit
# module (see data.terraform_remote_state.livekit in main.tf).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# CloudWatch Log Group
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.ecs_log_retention_days
}

# ---------------------------------------------------------------------------
# ECS Task Definition
#
# Plain env vars cover the non-sensitive runtime config (base URL, bot IDs,
# default participant IDs).  The Medplum client id/secret come through as
# `secrets` so ECS resolves them from SSM SecureString at container start.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "main" {
  family                   = "${local.name_prefix}-task"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = data.aws_iam_role.ecs_task_execution.arn
  task_role_arn            = data.aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "test-harness"
      image     = local.image_uri
      essential = true

      portMappings = [
        { containerPort = 80, protocol = "tcp", name = "http" },
      ]

      environment = local.container_env

      secrets = [
        {
          name      = "MEDPLUM_CLIENT_ID"
          valueFrom = aws_ssm_parameter.medplum_client_id.arn
        },
        {
          name      = "MEDPLUM_CLIENT_SECRET"
          valueFrom = aws_ssm_parameter.medplum_client_secret.arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.main.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "nginx"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1/healthz | grep -q ok || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 15
      }

      readonlyRootFilesystem = false
      privileged             = false
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "main" {
  name                   = "${local.name_prefix}-service"
  cluster                = local.ecs_cluster_arn
  task_definition        = aws_ecs_task_definition.main.arn
  desired_count          = var.ecs_desired_count
  launch_type            = "FARGATE"
  force_new_deployment   = true
  enable_execute_command = true

  network_configuration {
    subnets          = local.public_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "test-harness"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.https]

  lifecycle {
    ignore_changes = [desired_count]
  }
}
