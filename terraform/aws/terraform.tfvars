region             = "ca-central-1"
environment        = "dev"
deployment_id      = "1"
availability_zones = ["ca-central-1a", "ca-central-1b"]

app_domain    = "app.darren-aws.foomedical.dev"
api_domain    = "api.darren-aws.foomedical.dev"
support_email = "darren@medplum.com"

ssl_certificate_arn = "arn:aws:acm:us-east-1:462446642923:certificate/bff56fcf-0989-4fb6-84d4-28eee7e391ba"
alb_certificate_arn = "arn:aws:acm:ca-central-1:462446642923:certificate/b326c8f3-beb8-4063-8e7b-6c06f837c1cc"

tags = {
  app         = "medplum"
  environment = "dev"
}

# Compute
eks_node_instance_types = ["t3.large"]

# Database
db_instance_tier = "db.t3.medium"
db_storage_gb    = 32

# Cache
redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# DNS — Route 53 is in this account; Terraform will create records automatically
create_route53_records = true
route53_zone_name      = "darren-aws.foomedical.dev"

# EKS API server access — open for dev; restrict to your IP/VPN CIDR before production
# eks_public_access_cidrs = ["YOUR_IP/32"]
