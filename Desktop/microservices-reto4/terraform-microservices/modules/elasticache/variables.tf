variable "project_name"        { type = string }
variable "environment"         { type = string }
variable "vpc_id"              { type = string }
variable "private_subnet_ids"  { type = list(string) }
variable "redis_security_group"{ type = string }
variable "node_type"           { type = string }
