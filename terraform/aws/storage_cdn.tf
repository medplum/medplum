# Dedicated storage CloudFront distribution — mirrors CDK's Storage construct.
# Serves binary uploads at storage_domain with CloudFront signed URL enforcement.
# Enabled only when both storage_domain and storage_ssl_certificate_arn are set.

resource "aws_s3_bucket" "storage" {
  count         = local.storage_cdn_enabled ? 1 : 0
  bucket        = "${local.name_prefix}-binary-storage"
  force_destroy = var.environment != "prod"
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "storage" {
  count  = local.storage_cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.storage[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  count  = local.storage_cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.storage[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.medplum.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "storage" {
  count  = local.storage_cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.storage[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  count  = local.storage_cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.storage[0].id

  rule {
    id     = "intelligent-tiering"
    status = "Enabled"
    filter {}

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }
  }

  rule {
    id     = "noncurrent-version-expiration"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.environment == "prod" ? 90 : 30
    }
  }

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_cloudfront_origin_access_control" "storage" {
  count                             = local.storage_cdn_enabled ? 1 : 0
  name                              = "${local.name_prefix}-storage-oac"
  description                       = "Medplum binary storage S3 origin access control"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "storage" {
  count  = local.storage_cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.storage[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.storage[0].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.storage[0].arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.storage]
}

# Key group referencing the pre-created CloudFront public key (see README for generation steps)
resource "aws_cloudfront_key_group" "storage" {
  count   = local.storage_cdn_enabled && var.signing_key_id != "" ? 1 : 0
  name    = "${local.name_prefix}-storage-key-group"
  comment = "Key group for Medplum signed storage URLs"
  items   = [var.signing_key_id]
}

# Response headers policy: CORS + security headers for the storage CDN (mirrors CDK Storage construct)
resource "aws_cloudfront_response_headers_policy" "storage" {
  count = local.storage_cdn_enabled ? 1 : 0
  name  = "${local.name_prefix}-storage-headers"

  cors_config {
    access_control_allow_credentials = false
    access_control_allow_origins {
      items = compact(concat(
        ["https://${var.app_domain}"],
        var.storage_cdn_cors_extra_origins,
      ))
    }
    access_control_allow_headers { items = ["*"] }
    access_control_allow_methods { items = ["GET", "HEAD", "OPTIONS"] }
    access_control_max_age_sec = 600
    origin_override            = false
  }

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'none'; connect-src https://ccda.medplum.com; base-uri 'none'; form-action 'none'; frame-ancestors *;"
      override                = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
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
      value    = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "storage" {
  count      = local.storage_cdn_enabled ? 1 : 0
  enabled    = true
  aliases    = [var.storage_domain]
  web_acl_id = var.enable_waf && local.storage_cdn_enabled ? aws_wafv2_web_acl.storage[0].arn : null

  origin {
    domain_name              = aws_s3_bucket.storage[0].bucket_regional_domain_name
    origin_id                = "storage-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.storage[0].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "storage-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.storage[0].id

    # Enforce signed URLs — only requests with a valid CloudFront key-group signature are served
    trusted_key_groups = local.storage_cdn_enabled && var.signing_key_id != "" ? [aws_cloudfront_key_group.storage[0].id] : []
  }

  viewer_certificate {
    acm_certificate_arn      = local.effective_storage_cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  dynamic "logging_config" {
    for_each = var.storage_logging_bucket != "" ? [1] : []
    content {
      bucket          = "${var.storage_logging_bucket}.s3.amazonaws.com"
      include_cookies = false
      prefix          = var.storage_logging_prefix
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = var.tags

  depends_on = [aws_acm_certificate_validation.storage]
}

