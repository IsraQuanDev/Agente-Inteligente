variable "project_name"     { type = string }
variable "environment"      { type = string }
variable "aws_region"       { type = string }
variable "eks_cluster_name" { type = string }
variable "rds_cluster_id"   { type = string }
variable "sqs_queues"       { type = list(string) }
variable "alarm_email"      { type = string }
