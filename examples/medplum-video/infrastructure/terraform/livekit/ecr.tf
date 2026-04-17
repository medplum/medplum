# ---------------------------------------------------------------------------
# ECR repository for the LiveKit wrapper image
# The wrapper image is built from infrastructure/livekit-server/Dockerfile.
# Use `make push-image` (or the equivalent docker build/push commands) to
# build and upload the image before deploying the ECS service.
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "livekit" {
  name                 = "${local.name_prefix}-server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep only the 5 most recent image revisions to limit storage cost.
resource "aws_ecr_lifecycle_policy" "livekit" {
  repository = aws_ecr_repository.livekit.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Retain last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
