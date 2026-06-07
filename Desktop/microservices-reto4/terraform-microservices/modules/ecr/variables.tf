variable "project_name"           { type = string }
variable "environment"            { type = string }
variable "eks_node_role_arn"      { type = string }
variable "github_actions_role_arn"{ type = string; default = "arn:aws:iam::000000000000:role/github-actions-ecr" }
