output "cluster_id"       { value = aws_rds_cluster.aurora.cluster_identifier }
output "cluster_endpoint" { value = aws_rds_cluster.aurora.endpoint; sensitive = true }
output "reader_endpoint"  { value = aws_rds_cluster.aurora.reader_endpoint; sensitive = true }
output "secret_arn"       { value = aws_secretsmanager_secret.db_credentials.arn }
