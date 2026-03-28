# Application Load Balancer shell
# Terraform owns the ALB lifecycle (creation, WAF association, deletion).
# The AWS Load Balancer Controller adopts this ALB via the
# alb.ingress.kubernetes.io/load-balancer-arn Ingress annotation and manages
# target groups and listener rules dynamically as pods scale.

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for the Medplum API ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP - redirected to HTTPS by the ALB listener"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound so the ALB can reach pods on dynamic target-group ports"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# Allow the ALB to reach pods directly (IP target mode).
# The LB Controller assigns dynamic ephemeral ports per target group, so the
# full TCP range is permitted. Scoped to the ALB SG rather than a CIDR block.
resource "aws_security_group_rule" "eks_nodes_from_alb" {
  type                     = "ingress"
  description              = "Allow inbound from ALB to Medplum server pods (IP target mode)"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.eks_nodes.id
}

resource "aws_lb" "api" {
  name               = "${local.name_prefix}-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  # Enable deletion protection in production to prevent accidental terraform destroy
  enable_deletion_protection = var.environment == "prod"

  tags = var.tags
}

# Redirect all plain HTTP traffic to HTTPS before it reaches the application.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener — the LB Controller owns all listener rules after this point.
# The default action returns 404 for requests that don't match any Ingress rule.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = local.effective_alb_cert_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}
