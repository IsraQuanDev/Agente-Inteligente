output "bucket_name" { value = aws_s3_bucket.microservices.bucket }
output "bucket_arn"  { value = aws_s3_bucket.microservices.arn }
output "logs_bucket" { value = aws_s3_bucket.logs.bucket }
