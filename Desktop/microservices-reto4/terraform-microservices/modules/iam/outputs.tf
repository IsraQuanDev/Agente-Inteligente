output "eks_cluster_role_arn"          { value = aws_iam_role.eks_cluster.arn }
output "eks_node_role_arn"             { value = aws_iam_role.eks_node.arn }
output "api_gateway_cloudwatch_role_arn" { value = aws_iam_role.api_gateway_cloudwatch.arn }
