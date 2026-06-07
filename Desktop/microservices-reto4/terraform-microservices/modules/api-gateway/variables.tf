variable "project_name"             { type = string }
variable "environment"              { type = string }
variable "aws_region"               { type = string }
variable "waf_acl_arn"              { type = string }
variable "jwt_issuer"               { type = string }
variable "jwt_audience"             { type = string }
variable "nlb_dns_name"             { type = string }
variable "cloudwatch_role_arn"      { type = string }
variable "private_subnet_ids"       { type = list(string); default = [] }
