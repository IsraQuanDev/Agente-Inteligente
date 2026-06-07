output "order_queue_url"        { value = aws_sqs_queue.order_events.url }
output "payment_queue_url"      { value = aws_sqs_queue.payment_events.url }
output "notification_queue_url" { value = aws_sqs_queue.notification_events.url }
output "sns_topic_arn"          { value = aws_sns_topic.microservices_events.arn }
output "queue_names" {
  value = [
    aws_sqs_queue.order_events.name,
    aws_sqs_queue.payment_events.name,
    aws_sqs_queue.notification_events.name
  ]
}
