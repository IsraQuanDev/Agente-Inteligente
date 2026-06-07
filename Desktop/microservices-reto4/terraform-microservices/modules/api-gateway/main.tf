# modules/api-gateway/main.tf
# HTTP API Gateway (v2) with JWT authorizer and VPC Link to EKS NLB

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-${var.environment}-api"
  protocol_type = "HTTP"
  description   = "API Gateway for microservices — JWT-protected"

  cors_configuration {
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type", "X-Request-ID"]
    expose_headers    = ["X-Request-ID"]
    max_age           = 3600
  }

  tags = { Name = "${var.project_name}-${var.environment}-api" }
}

# ── JWT Authorizer ────────────────────────────
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "jwt-authorizer"

  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = [var.jwt_audience]
  }
}

# ── VPC Link to internal NLB ──────────────────
resource "aws_apigatewayv2_vpc_link" "eks" {
  name               = "${var.project_name}-${var.environment}-vpc-link"
  security_group_ids = []
  subnet_ids         = var.private_subnet_ids
}

# ── Stage with access logging ─────────────────
resource "aws_cloudwatch_log_group" "api_gw" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
      integrationError = "$context.integrationErrorMessage"
      jwtClaims      = "$context.authorizer.claims"
    })
  }

  default_route_settings {
    throttling_burst_limit = 500
    throttling_rate_limit  = 200
    logging_level          = "INFO"
    data_trace_enabled     = false
    detailed_metrics_enabled = true
  }

  tags = { Name = "${var.project_name}-${var.environment}-stage" }
}

# ── WAF Association ───────────────────────────
resource "aws_wafv2_web_acl_association" "api_gw" {
  resource_arn = aws_apigatewayv2_stage.prod.arn
  web_acl_arn  = var.waf_acl_arn
}

# ──────────────────────────────────────────────
# INTEGRATIONS + ROUTES per Microservice
# Each microservice gets its own integration to
# the EKS NLB via VPC Link.
# ──────────────────────────────────────────────

locals {
  services = {
    auth         = { path = "/auth",         port = 8080, strip = true }
    user         = { path = "/users",        port = 8081, strip = true }
    product      = { path = "/products",     port = 8082, strip = true }
    order        = { path = "/orders",       port = 8083, strip = true }
    payment      = { path = "/payments",     port = 8084, strip = true }
    notification = { path = "/notifications", port = 8085, strip = true }
  }

  # Auth routes do NOT require JWT (login/register)
  public_routes  = ["/auth/login", "/auth/register", "/auth/refresh"]
}

resource "aws_apigatewayv2_integration" "services" {
  for_each = local.services

  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = "http://${var.nlb_dns_name}:${each.value.port}{proxy}"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.eks.id

  request_parameters = {
    "overwrite:path"                         = "$request.path.proxy"
    "append:header.X-Forwarded-For"          = "$context.identity.sourceIp"
    "append:header.X-Request-ID"             = "$context.requestId"
    "append:header.X-JWT-Subject"            = "$context.authorizer.claims.sub"
    "append:header.X-JWT-Email"              = "$context.authorizer.claims.email"
  }
}

# Protected routes (require JWT)
resource "aws_apigatewayv2_route" "protected" {
  for_each = local.services

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "ANY ${each.value.path}/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.services[each.key].id}"
  authorization_type = each.key == "auth" ? "NONE" : "JWT"
  authorizer_id      = each.key == "auth" ? null : aws_apigatewayv2_authorizer.jwt.id
}

# Health-check route (no auth)
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.services["user"].id}"
}

# ── API Gateway account-level CloudWatch role ─
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = var.cloudwatch_role_arn
}
