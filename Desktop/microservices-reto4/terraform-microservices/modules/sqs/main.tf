# modules/sqs/main.tf

locals {
  queues = {
    order        = { fifo = false, delay = 0 }
    payment      = { fifo = false, delay = 0 }
    notification = { fifo = false, delay = 0 }
    order_dlq    = { fifo = false, delay = 0 }
  }
}

# ── Dead Letter Queues ────────────────────────
resource "aws_sqs_queue" "dlq" {
  for_each = toset(["order", "payment", "notification"])

  name                      = "${var.project_name}-${var.environment}-${each.key}-dlq"
  message_retention_seconds = 1209600  # 14 days
  kms_master_key_id         = "alias/aws/sqs"

  tags = { Name = "${var.project_name}-${var.environment}-${each.key}-dlq", Queue = each.key }
}

# ── Main Queues ───────────────────────────────
resource "aws_sqs_queue" "order_events" {
  name                       = "${var.project_name}-${var.environment}-order-events"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq["order"].arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${var.project_name}-${var.environment}-order-events" }
}

resource "aws_sqs_queue" "payment_events" {
  name                       = "${var.project_name}-${var.environment}-payment-events"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq["payment"].arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${var.project_name}-${var.environment}-payment-events" }
}

resource "aws_sqs_queue" "notification_events" {
  name                       = "${var.project_name}-${var.environment}-notification-events"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq["notification"].arn
    maxReceiveCount     = 5
  })

  tags = { Name = "${var.project_name}-${var.environment}-notification-events" }
}

# ── SNS Topic for fan-out ─────────────────────
resource "aws_sns_topic" "microservices_events" {
  name              = "${var.project_name}-${var.environment}-events"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "order_sub" {
  topic_arn = aws_sns_topic.microservices_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.order_events.arn

  filter_policy = jsonencode({ eventType = ["ORDER_CREATED", "ORDER_UPDATED", "ORDER_CANCELLED"] })
}

resource "aws_sns_topic_subscription" "notification_sub" {
  topic_arn = aws_sns_topic.microservices_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.notification_events.arn

  filter_policy = jsonencode({ eventType = ["PAYMENT_COMPLETED", "ORDER_SHIPPED", "USER_REGISTERED"] })
}

# ── SQS Policy (allow SNS to send) ───────────
resource "aws_sqs_queue_policy" "order_events" {
  queue_url = aws_sqs_queue.order_events.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.order_events.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.microservices_events.arn } }
    }]
  })
}

resource "aws_sqs_queue_policy" "notification_events" {
  queue_url = aws_sqs_queue.notification_events.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.notification_events.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.microservices_events.arn } }
    }]
  })
}
