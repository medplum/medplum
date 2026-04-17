# ---------------------------------------------------------------------------
# ALB - public HTTPS/HTTP (in the shared livekit VPC)
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "ALB for the test-harness SPA - public 80/443"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from the world"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from the world (redirected to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound (to ECS tasks)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-alb-sg" })
}

# ---------------------------------------------------------------------------
# ECS tasks - only accept traffic from the ALB (port 80)
# ---------------------------------------------------------------------------

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "test-harness ECS tasks - inbound from ALB only"
  vpc_id      = local.vpc_id

  ingress {
    description     = "HTTP from the ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound (ECR, SSM, Medplum API, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ecs-sg" })
}
