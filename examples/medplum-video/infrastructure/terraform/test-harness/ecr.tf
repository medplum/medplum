resource "aws_ecr_repository" "test_harness" {
  name                 = local.name_prefix
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "test_harness" {
  repository = aws_ecr_repository.test_harness.name

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
