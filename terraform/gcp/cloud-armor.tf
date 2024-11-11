# Cloud Armor security policy
resource "google_compute_security_policy" "edge_security_policy" {
  name        = "edge-security-policy"
  project     = var.project_id
  description = "edge security policy for Cloud Armor"
  type        = "CLOUD_ARMOR_EDGE"

  # Default allow rule
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule to allow all other traffic"
  }
}

# Google Cloud Armor security policy for GKE Ingress
resource "google_compute_security_policy" "ingress_security_policy" {
  name        = "ingress-security-policy"
  description = "Security policy with WAF rules for GKE Ingress"

  # WAF rules for GKE Ingress
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = true
      rule_visibility = "STANDARD" 
    }
  }
  # Rule to block SQL Injection attacks
  rule {
    priority = 1000
    action   = "deny"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Block SQL Injection attacks"
  }

  # Rule to block Cross-site Scripting (XSS) attacks
  rule {
    priority = 1001
    action   = "deny"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Block Cross-site Scripting (XSS) attacks"
  }

  # Rule to block Remote Code Execution (RCE) attacks
  rule {
    priority = 1002
    action   = "deny"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('rce-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Block Remote Code Execution (RCE) attacks"
  }

  # Rate limiting to mitigate DDoS attacks
  rule {
    priority = 900
    action   = "rate_based_ban"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      rate_limit_threshold {
        count        = 1000
        interval_sec = 60
      }
      conform_action   = "allow"
      exceed_action    = "deny(429)"
      ban_duration_sec = 600
    }
    description = "Rate limit to mitigate DDoS attacks"
  }

  # Default allow rule
  rule {
    priority = 2147483647
    action   = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule to allow all other traffic"
  }
}