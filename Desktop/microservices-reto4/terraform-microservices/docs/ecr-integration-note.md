# Append to main.tf — ECR module integration
# (Add this block inside main.tf after the existing modules)

# module "ecr" {
#   source = "./modules/ecr"
#
#   project_name             = var.project_name
#   environment              = var.environment
#   eks_node_role_arn        = module.iam.eks_node_role_arn
#   github_actions_role_arn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/github-actions-ecr"
# }
#
# Add to outputs.tf:
# output "ecr_repository_urls" {
#   value = module.ecr.repository_urls
# }
