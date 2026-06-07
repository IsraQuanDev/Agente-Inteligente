output "primary_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}
output "reader_endpoint" {
  value     = aws_elasticache_replication_group.redis.reader_endpoint_address
  sensitive = true
}
