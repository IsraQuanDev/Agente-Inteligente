# modules/cloudwatch/main.tf

# ── SNS Topic for Alarms ──────────────────────
resource "aws_sns_topic" "alarms" {
  name = "${var.project_name}-${var.environment}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ── CloudWatch Dashboard ──────────────────────
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "metric"
        x = 0; y = 0; width = 12; height = 6
        properties = {
          title   = "API Gateway — Request Count & Latency"
          metrics = [
            ["AWS/ApiGateway", "Count", { stat = "Sum", period = 60 }],
            ["AWS/ApiGateway", "Latency", { stat = "p99", period = 60 }]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type       = "metric"
        x = 12; y = 0; width = 12; height = 6
        properties = {
          title   = "EKS — Node CPU & Memory"
          metrics = [
            ["ContainerInsights", "node_cpu_utilization", "ClusterName", var.eks_cluster_name],
            ["ContainerInsights", "node_memory_utilization", "ClusterName", var.eks_cluster_name]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type       = "metric"
        x = 0; y = 6; width = 12; height = 6
        properties = {
          title   = "RDS Aurora — CPU & Connections"
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", var.rds_cluster_id],
            ["AWS/RDS", "DatabaseConnections", "DBClusterIdentifier", var.rds_cluster_id]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type       = "metric"
        x = 12; y = 6; width = 12; height = 6
        properties = {
          title   = "SQS — Messages In Flight"
          metrics = [for q in var.sqs_queues :
            ["AWS/SQS", "ApproximateNumberOfMessagesNotVisible", "QueueName", q]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      }
    ]
  })
}

# ── Alarms: API Gateway 5xx ───────────────────
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project_name}-${var.environment}-api-5xx-high"
  alarm_description   = "API Gateway 5xx error rate is high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
}

# ── Alarms: RDS CPU ───────────────────────────
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-high"
  alarm_description   = "Aurora CPU utilization is high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  dimensions          = { DBClusterIdentifier = var.rds_cluster_id }
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "breaching"
}

# ── Alarms: DLQ messages ──────────────────────
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  for_each = toset(["order", "payment", "notification"])

  alarm_name          = "${var.project_name}-${var.environment}-${each.key}-dlq-messages"
  alarm_description   = "Messages accumulating in ${each.key} DLQ"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  dimensions          = { QueueName = "${var.project_name}-${var.environment}-${each.key}-dlq" }
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
}

# ── Container Insights ────────────────────────
resource "aws_cloudwatch_log_group" "eks_containers" {
  name              = "/aws/containerinsights/${var.eks_cluster_name}/application"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "eks_performance" {
  name              = "/aws/containerinsights/${var.eks_cluster_name}/performance"
  retention_in_days = 14
}

# ── Log Metric Filters: JWT Failures ─────────
resource "aws_cloudwatch_log_metric_filter" "jwt_auth_failures" {
  name           = "${var.project_name}-${var.environment}-jwt-auth-failures"
  pattern        = "[timestamp, requestId, ip, user, timestamp2, request, status=401 || status=403, ...]"
  log_group_name = "/aws/apigateway/${var.project_name}-${var.environment}"

  metric_transformation {
    name      = "JWTAuthFailures"
    namespace = "${var.project_name}/${var.environment}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "jwt_auth_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-jwt-auth-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "JWTAuthFailures"
  namespace           = "${var.project_name}/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
}
