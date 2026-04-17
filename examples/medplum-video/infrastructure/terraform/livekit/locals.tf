locals {
  # Resource name prefix keeps all AWS resources consistently named.
  name_prefix = "${var.environment}-livekit"

  # Full hostname: <prefix>.<zone-domain>  e.g. livekit.medplum.dev
  domain_name = "${var.domain_prefix}.${trimsuffix(data.aws_route53_zone.main.name, ".")}"

  # Common tags applied to all non-IAM resources.
  # IAM resources are deliberately left untagged to avoid requiring the
  # iam:TagRole / iam:TagInstanceProfile permissions that SSO roles often lack.
  common_tags = {
    Project     = "medplum-video"
    Component   = "livekit"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # Compute subnet newbits so the result is always a valid prefix length.
  # Target: /24 subnets for large VPCs, /28 for small ones (min 16 IPs).
  # Formula: newbits = clamp(24 - vpc_prefix, 4, 8)
  #   /16 VPC → newbits=8  → /24 subnets  (256 IPs each) ✓
  #   /20 VPC → newbits=4  → /24 subnets  (256 IPs each) ✓
  #   /24 VPC → newbits=4  → /28 subnets  ( 14 IPs each) ✓
  vpc_prefix_length = tonumber(split("/", var.vpc_cidr)[1])
  subnet_newbits    = max(4, min(8, 24 - local.vpc_prefix_length))

  # Resolved image URI: prefer explicit variable, fall back to the ECR repo
  # created by ecr.tf.  The ECR path is only evaluated after the repo exists,
  # so pass --target=aws_ecr_repository.livekit on first apply (see Makefile).
  livekit_image_uri = (
    var.livekit_image != ""
    ? var.livekit_image
    : "${aws_ecr_repository.livekit.repository_url}:${var.livekit_image_tag}"
  )

  # LiveKit server configuration YAML.
  # Keys are NOT embedded here – they are injected separately via the
  # --keys CLI flag from the LIVEKIT_KEYS SSM SecureString secret.
  #
  # TURN is configured with external_tls = true because TLS is terminated by
  # the NLB TLS listener before traffic reaches the container on port 5349.
  livekit_config_yaml = <<-YAML
    port: 7880
    bind_addresses:
      - ""

    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true

    turn:
      enabled: true
      domain: ${local.domain_name}
      # UDP STUN/TURN (NLB UDP listener → container port 3478)
      udp_port: 3478
      # TURN-TLS  (NLB TLS listener terminates TLS → container port 5349)
      tls_port: 5349
      # TLS is terminated at the NLB; the container sees plain TCP on 5349.
      external_tls: true

    logging:
      json: true
      level: info

    prometheus:
      port: 6789
  YAML
}
