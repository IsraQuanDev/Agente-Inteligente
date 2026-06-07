terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "tf-state-microservices-reto4"
    key            = "microservices/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "tf-state-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "microservices-reto4"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "devops-team"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  token                  = module.eks.cluster_token
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    token                  = module.eks.cluster_token
  }
}

# ──────────────────────────────────────────────
# DATA SOURCES
# ──────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# ──────────────────────────────────────────────
# MODULES
# ──────────────────────────────────────────────
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  public_subnets     = var.public_subnets
  private_subnets    = var.private_subnets
}

module "security_groups" {
  source = "./modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
  vpc_cidr     = var.vpc_cidr
}

module "iam" {
  source = "./modules/iam"

  project_name     = var.project_name
  environment      = var.environment
  aws_account_id   = data.aws_caller_identity.current.account_id
  aws_region       = var.aws_region
  eks_cluster_name = local.eks_cluster_name
}

module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

module "sqs" {
  source = "./modules/sqs"

  project_name = var.project_name
  environment  = var.environment
}

module "rds" {
  source = "./modules/rds"

  project_name            = var.project_name
  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  db_security_group_id    = module.security_groups.rds_sg_id
  db_instance_class       = var.db_instance_class
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password             = var.db_password
}

module "elasticache" {
  source = "./modules/elasticache"

  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  redis_security_group = module.security_groups.redis_sg_id
  node_type            = var.redis_node_type
}

module "eks" {
  source = "./modules/eks"

  project_name         = var.project_name
  environment          = var.environment
  cluster_name         = local.eks_cluster_name
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  eks_sg_id            = module.security_groups.eks_sg_id
  node_role_arn        = module.iam.eks_node_role_arn
  cluster_role_arn     = module.iam.eks_cluster_role_arn
  node_instance_types  = var.node_instance_types
  node_desired_size    = var.node_desired_size
  node_min_size        = var.node_min_size
  node_max_size        = var.node_max_size
  kubernetes_version   = var.kubernetes_version
}

module "waf" {
  source = "./modules/waf"

  project_name = var.project_name
  environment  = var.environment
}

module "api_gateway" {
  source = "./modules/api-gateway"

  project_name        = var.project_name
  environment         = var.environment
  aws_region          = var.aws_region
  waf_acl_arn         = module.waf.waf_acl_arn
  jwt_issuer          = var.jwt_issuer
  jwt_audience        = var.jwt_audience
  nlb_dns_name        = module.eks.nlb_dns_name
  cloudwatch_role_arn = module.iam.api_gateway_cloudwatch_role_arn
}

module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name     = var.project_name
  environment      = var.environment
  aws_region       = var.aws_region
  eks_cluster_name = local.eks_cluster_name
  rds_cluster_id   = module.rds.cluster_id
  sqs_queues       = module.sqs.queue_names
  alarm_email      = var.alarm_email
}

# ──────────────────────────────────────────────
# LOCALS
# ──────────────────────────────────────────────
locals {
  eks_cluster_name = "${var.project_name}-${var.environment}-eks"
}
