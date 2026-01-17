# Medplum Azure Deployment Configuration
# ========================================
# Domain: darren-azure.foomedical.dev (delegated from Squarespace)

# Azure region - Canada Central (Toronto)
location = "canadacentral"

# Resource group name
resource_group_name = "darren-medplum-rg"

# Environment: dev uses smaller, cheaper resources
environment = "dev"

# Deployment ID
deployment_id = "1"

# App domain for Azure Front Door CDN
# This matches the DNS zone created in dns.tf
app_domain = "app.darren-azure.foomedical.dev"

# Resource tags
tags = {
  Environment = "dev"
  Project     = "medplum"
  ManagedBy   = "terraform"
  Owner       = "darren"
}
