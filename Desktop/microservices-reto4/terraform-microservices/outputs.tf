output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = local.eks_cluster_name
}

output "rds_cluster_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = module.rds.cluster_endpoint
  sensitive   = true
}

output "rds_reader_endpoint" {
  description = "Aurora cluster reader endpoint"
  value       = module.rds.reader_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
  sensitive   = true
}

output "api_gateway_url" {
  description = "API Gateway invoke URL"
  value       = module.api_gateway.invoke_url
}

output "s3_bucket_name" {
  description = "S3 bucket for service assets"
  value       = module.s3.bucket_name
}

output "sqs_order_queue_url" {
  description = "SQS URL for order events"
  value       = module.sqs.order_queue_url
}

output "sqs_notification_queue_url" {
  description = "SQS URL for notification events"
  value       = module.sqs.notification_queue_url
}

output "cloudwatch_dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${var.project_name}-${var.environment}"
}
