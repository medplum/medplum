# ---------------------------------------------------------------------------
# Security group for ECS Fargate tasks
#
# NLBs use "IP" target type, which preserves the original source IP. The ECS
# task security group therefore needs to accept traffic from 0.0.0.0/0 on the
# LiveKit ports. All WebRTC media traverses the TURN relay; raw RTC UDP (7882)
# is also exposed for clients on networks where TURN is not required.
# ---------------------------------------------------------------------------

resource "aws_security_group" "livekit_ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "LiveKit ECS Fargate tasks - inbound from NLB, outbound unrestricted"
  vpc_id      = aws_vpc.main.id

  # ----- Inbound ---------------------------------------------------------- #

  ingress {
    description = "HTTP / WebSocket API (WSS terminates at NLB TLS listener)"
    from_port   = 7880
    to_port     = 7880
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "RTC over TCP (direct, non-TURN path)"
    from_port   = 7881
    to_port     = 7881
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "WebRTC media and TURN relay UDP (50000-60000)"
    from_port   = 50000
    to_port     = 60000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN / TURN over UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN / TURN over TCP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "TURN-TLS (TLS terminated at NLB, arrives plain TCP)"
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Prometheus metrics (VPC-internal only)"
    from_port   = 6789
    to_port     = 6789
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # ----- Outbound --------------------------------------------------------- #

  egress {
    description = "Allow all outbound (image pulls, LiveKit TURN relay, API calls)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-ecs-sg" }
}

# ---------------------------------------------------------------------------
# Security group for VPC Interface Endpoints
# (ECR API/DKR, SSM, CloudWatch Logs)
# ---------------------------------------------------------------------------

resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.name_prefix}-vpc-endpoints"
  description = "Allow HTTPS traffic from private subnets to VPC interface endpoints"
  # Only used when nat_gateway_enabled = true (VPC endpoint resources reference it)
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from private subnets"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = aws_subnet.private[*].cidr_block
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-vpc-endpoints-sg" }
}
