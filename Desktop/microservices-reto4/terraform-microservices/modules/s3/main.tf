# modules/s3/main.tf

resource "aws_s3_bucket" "microservices" {
  bucket        = "${var.project_name}-${var.environment}-assets-${var.aws_region}"
  force_destroy = false

  tags = { Name = "${var.project_name}-${var.environment}-assets" }
}

resource "aws_s3_bucket_versioning" "microservices" {
  bucket = aws_s3_bucket.microservices.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "microservices" {
  bucket = aws_s3_bucket.microservices.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "microservices" {
  bucket                  = aws_s3_bucket.microservices.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "microservices" {
  bucket = aws_s3_bucket.microservices.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration { noncurrent_days = 90 }
    filter { prefix = "" }
  }
}

# ── Bucket for access logs ────────────────────
resource "aws_s3_bucket" "logs" {
  bucket        = "${var.project_name}-${var.environment}-logs-${var.aws_region}"
  force_destroy = false

  tags = { Name = "${var.project_name}-${var.environment}-logs" }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire-logs"
    status = "Enabled"
    expiration { days = 90 }
    filter { prefix = "" }
  }
}
