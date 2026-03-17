resource "aws_cloudfront_origin_access_control" "medplum" {
  name                              = "${local.name_prefix}-oac"
  description                       = "Medplum S3 origin access control"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "medplum" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = var.ssl_certificate_arn != null ? [var.app_domain] : []

  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "static-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.medplum.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "static-s3"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    compress = true
  }

  viewer_certificate {
    acm_certificate_arn            = var.ssl_certificate_arn
    ssl_support_method             = var.ssl_certificate_arn != null ? "sni-only" : null
    minimum_protocol_version       = var.ssl_certificate_arn != null ? "TLSv1.2_2021" : "TLSv1"
    cloudfront_default_certificate = var.ssl_certificate_arn == null ? true : false
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

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = var.tags
}
