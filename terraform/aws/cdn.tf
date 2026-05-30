resource "aws_cloudfront_origin_access_control" "medplum" {
  name                              = "${local.name_prefix}-oac"
  description                       = "Medplum S3 origin access control"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Security and permissions response headers policy for the app CloudFront — mirrors CDK FrontEnd construct.
resource "aws_cloudfront_response_headers_policy" "app" {
  name = "${local.name_prefix}-app-headers"

  security_headers_config {
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'none'",
        "base-uri 'self'",
        "child-src 'self'",
        "connect-src 'self' ${var.api_domain} *.medplum.com *.google.com",
        "font-src 'self' fonts.gstatic.com",
        "form-action 'self' *.gstatic.com *.google.com",
        "frame-ancestors 'none'",
        "frame-src 'self' ${local.storage_cdn_enabled ? var.storage_domain : var.api_domain} *.medplum.com *.gstatic.com *.google.com",
        "img-src 'self' data: ${local.storage_cdn_enabled ? var.storage_domain : var.api_domain} *.gstatic.com *.google.com *.googleapis.com",
        "manifest-src 'self'",
        "media-src 'self' ${local.storage_cdn_enabled ? var.storage_domain : var.api_domain}",
        "script-src 'self' *.medplum.com *.gstatic.com *.google.com",
        "style-src 'self' 'unsafe-inline' *.medplum.com *.gstatic.com *.google.com",
        "worker-src 'self' blob: *.gstatic.com *.google.com",
        "upgrade-insecure-requests",
      ])
      override = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
      override = true
    }
  }
}

# Cache policy for the /api/* proxy behavior — mirrors CDK ApiOriginCachePolicy.
# TTL 0 on all methods; forwards all cookies, all query strings, and specific headers.
resource "aws_cloudfront_cache_policy" "api_proxy" {
  count       = var.app_api_proxy ? 1 : 0
  name        = "${local.name_prefix}-api-proxy"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "Content-Encoding", "Content-Type", "If-None-Match", "Origin", "Referer", "User-Agent", "X-Medplum"]
      }
    }
    query_strings_config {
      query_string_behavior = "all"
    }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

resource "aws_cloudfront_distribution" "medplum" {
  enabled             = true
  default_root_object = "index.html"
  aliases    = [var.app_domain]
  web_acl_id          = var.enable_waf ? aws_wafv2_web_acl.app[0].arn : null

  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "static-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.medplum.id
  }

  dynamic "origin" {
    for_each = var.app_api_proxy ? [1] : []
    content {
      domain_name = var.api_domain
      origin_id   = "api-origin"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "static-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.app.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.app_api_proxy ? [1] : []
    content {
      path_pattern           = "/api/*"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD"]
      target_origin_id       = "api-origin"
      cache_policy_id        = aws_cloudfront_cache_policy.api_proxy[0].id
      viewer_protocol_policy = "redirect-to-https"
      compress               = true
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.ssl_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }

  # SPA routing: redirect S3 403/404s to index.html so React Router handles the path
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  dynamic "logging_config" {
    for_each = var.app_logging_bucket != "" ? [1] : []
    content {
      bucket          = "${var.app_logging_bucket}.s3.amazonaws.com"
      include_cookies = false
      prefix          = var.app_logging_prefix
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = var.tags
}
