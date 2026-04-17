# ---------------------------------------------------------------------------
# ECS Cluster
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "livekit" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.ecs_log_retention_days
}

# ---------------------------------------------------------------------------
# ECS Task Definition
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "livekit" {
  family                   = "${local.name_prefix}-task"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = data.aws_iam_role.ecs_task_execution.arn
  task_role_arn            = data.aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "livekit"
      image     = local.livekit_image_uri
      essential = true

      # entrypoint.sh reads LIVEKIT_CONFIG_YAML and LIVEKIT_KEYS from the
      # environment, writes a config file, then execs livekit-server.
      # No command override is needed – the Dockerfile ENTRYPOINT handles it.

      portMappings = [
        { containerPort = 7880, protocol = "tcp", name = "http-ws" },
        { containerPort = 7881, protocol = "tcp", name = "rtc-tcp" },
        { containerPort = 7882, protocol = "udp", name = "rtc-udp" },
        # 3478 can only appear once – ECS rejects duplicate containerPort values
        # even across protocols. UDP covers STUN/TURN; TLS TURN uses 5349.
        { containerPort = 3478, protocol = "udp", name = "turn-udp" },
        { containerPort = 5349, protocol = "tcp", name = "turn-tls" },
        { containerPort = 6789, protocol = "tcp", name = "prometheus" },
      ]

      # Secrets are resolved from SSM by the ECS agent before container start.
      secrets = [
        {
          name      = "LIVEKIT_CONFIG_YAML"
          valueFrom = aws_ssm_parameter.livekit_config.arn
        },
        {
          name      = "LIVEKIT_KEYS"
          valueFrom = aws_ssm_parameter.livekit_keys.arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.livekit.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "livekit"
        }
      }

      # LiveKit's root HTTP handler returns a redirect; wget follows it.
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:7880/ > /dev/null || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 45
      }

      readonlyRootFilesystem = false
      privileged             = false
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "livekit" {
  name                   = "${local.name_prefix}-service"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.livekit.arn
  desired_count          = var.ecs_desired_count
  launch_type            = "FARGATE"
  force_new_deployment   = true
  enable_execute_command = true # Allows `aws ecs execute-command` for debugging

  network_configuration {
    # When NAT is disabled tasks run in public subnets and need a public IP
    # to reach ECR, SSM, and external APIs directly.
    subnets          = var.nat_gateway_enabled ? aws_subnet.private[*].id : aws_subnet.public[*].id
    security_groups  = [aws_security_group.livekit_ecs.id]
    assign_public_ip = !var.nat_gateway_enabled
  }

  # WebSocket / HTTP API
  load_balancer {
    target_group_arn = aws_lb_target_group.http.arn
    container_name   = "livekit"
    container_port   = 7880
  }

  # Direct WebRTC UDP (for clients that can reach the NLB directly)
  load_balancer {
    target_group_arn = aws_lb_target_group.rtc_udp.arn
    container_name   = "livekit"
    container_port   = 7882
  }

  # TURN UDP
  load_balancer {
    target_group_arn = aws_lb_target_group.turn_udp.arn
    container_name   = "livekit"
    container_port   = 3478
  }

  # TURN-TLS
  load_balancer {
    target_group_arn = aws_lb_target_group.turn_tls.arn
    container_name   = "livekit"
    container_port   = 5349
  }

  depends_on = [
    aws_lb_listener.wss,
    aws_lb_listener.http,
    aws_lb_listener.rtc_udp,
    aws_lb_listener.turn_udp,
    aws_lb_listener.turn_tls,
  ]

  lifecycle {
    # Allow external tools (e.g. CI/CD) to update the desired count.
    ignore_changes = [desired_count]
  }
}
