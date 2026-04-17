# ---------------------------------------------------------------------------
# Network Load Balancer
#
# A single internet-facing NLB handles all LiveKit traffic:
#
#   TCP 443  (TLS)  → port 7880  – WebSocket Secure (WSS) API
#   TCP 80          → port 7880  – plain HTTP (for healthchecks / redirect)
#   UDP 7882        → port 7882  – direct WebRTC media (non-TURN path)
#   UDP 3478        → port 3478  – STUN / TURN
#   TCP 5349 (TLS)  → port 5349  – TURN-TLS
#
# NLBs are the only AWS LB type that supports UDP – required for WebRTC and
# STUN/TURN.  TLS is terminated at the NLB using the ACM certificate so the
# LiveKit container sees plain TCP (external_tls = true in livekit.yaml).
# ---------------------------------------------------------------------------

resource "aws_lb" "livekit" {
  name               = "${local.name_prefix}-nlb"
  load_balancer_type = "network"
  internal           = false
  subnets            = aws_subnet.public[*].id

  # Required for UDP listeners.
  enable_cross_zone_load_balancing = true

  # Preserve source IP for correct ICE candidate generation.
  # (NLB does this by default – no proxy protocol needed.)

  tags = { Name = "${local.name_prefix}-nlb" }
}

# ---------------------------------------------------------------------------
# Target Groups  (all use "ip" type – required for Fargate awsvpc networking)
# Health checks run over HTTP on port 7880 since LiveKit serves its root there.
# ---------------------------------------------------------------------------

locals {
  tg_health_check = {
    enabled             = true
    protocol            = "HTTP"
    port                = "7880"
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 30
  }
}

resource "aws_lb_target_group" "http" {
  name        = substr("${local.name_prefix}-http", 0, 32)
  port        = 7880
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = local.tg_health_check.enabled
    protocol            = local.tg_health_check.protocol
    port                = local.tg_health_check.port
    path                = local.tg_health_check.path
    healthy_threshold   = local.tg_health_check.healthy_threshold
    unhealthy_threshold = local.tg_health_check.unhealthy_threshold
    interval            = local.tg_health_check.interval
  }
}

resource "aws_lb_target_group" "rtc_udp" {
  name        = substr("${local.name_prefix}-rtc-udp", 0, 32)
  port        = 7882
  protocol    = "UDP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = local.tg_health_check.enabled
    protocol            = local.tg_health_check.protocol
    port                = local.tg_health_check.port
    path                = local.tg_health_check.path
    healthy_threshold   = local.tg_health_check.healthy_threshold
    unhealthy_threshold = local.tg_health_check.unhealthy_threshold
    interval            = local.tg_health_check.interval
  }
}

resource "aws_lb_target_group" "turn_udp" {
  name        = substr("${local.name_prefix}-turn-udp", 0, 32)
  port        = 3478
  protocol    = "UDP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = local.tg_health_check.enabled
    protocol            = local.tg_health_check.protocol
    port                = local.tg_health_check.port
    path                = local.tg_health_check.path
    healthy_threshold   = local.tg_health_check.healthy_threshold
    unhealthy_threshold = local.tg_health_check.unhealthy_threshold
    interval            = local.tg_health_check.interval
  }
}

resource "aws_lb_target_group" "turn_tls" {
  name        = substr("${local.name_prefix}-turn-tls", 0, 32)
  port        = 5349
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = local.tg_health_check.enabled
    protocol            = local.tg_health_check.protocol
    port                = local.tg_health_check.port
    path                = local.tg_health_check.path
    healthy_threshold   = local.tg_health_check.healthy_threshold
    unhealthy_threshold = local.tg_health_check.unhealthy_threshold
    interval            = local.tg_health_check.interval
  }
}

# ---------------------------------------------------------------------------
# Listeners
# ---------------------------------------------------------------------------

# WSS – TLS terminated here; container receives plain HTTP/WS on port 7880.
resource "aws_lb_listener" "wss" {
  load_balancer_arn = aws_lb.livekit.arn
  port              = 443
  protocol          = "TLS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.livekit.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.http.arn
  }
}

# Plain HTTP – useful for internal health-checks; no redirect on NLB.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.livekit.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.http.arn
  }
}

# Direct WebRTC UDP media.
resource "aws_lb_listener" "rtc_udp" {
  load_balancer_arn = aws_lb.livekit.arn
  port              = 7882
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rtc_udp.arn
  }
}

# STUN / TURN UDP.
resource "aws_lb_listener" "turn_udp" {
  load_balancer_arn = aws_lb.livekit.arn
  port              = 3478
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.turn_udp.arn
  }
}

# TURN-TLS (TLS terminated at NLB; plain TCP reaches the container).
resource "aws_lb_listener" "turn_tls" {
  load_balancer_arn = aws_lb.livekit.arn
  port              = 5349
  protocol          = "TLS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.livekit.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.turn_tls.arn
  }
}
