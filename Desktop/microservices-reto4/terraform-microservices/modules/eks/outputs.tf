output "cluster_endpoint"    { value = aws_eks_cluster.main.endpoint }
output "cluster_ca_certificate" { value = aws_eks_cluster.main.certificate_authority[0].data }
output "cluster_token"       { value = aws_eks_cluster.main.name }  # resolved via AWS auth
output "oidc_provider_arn"   { value = aws_iam_openid_connect_provider.eks.arn }
output "oidc_provider_url"   { value = aws_iam_openid_connect_provider.eks.url }
output "nlb_dns_name"        { value = "internal-nlb.${var.cluster_name}.local" } # set after LB controller provisions
output "microservices_namespace" { value = kubernetes_namespace.microservices.metadata[0].name }
