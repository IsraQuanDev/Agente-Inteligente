# ═══════════════════════════════════════════════════════════════
# Makefile — Microservices Reto 4
# Usage: make <target>
# ═══════════════════════════════════════════════════════════════

.DEFAULT_GOAL := help
SHELL         := /bin/bash
ENV           ?= prod
REGION        ?= us-east-1
PROJECT       ?= ms-reto4
CLUSTER       := $(PROJECT)-$(ENV)-eks
NAMESPACE     := microservices
SERVICES      := auth user product order payment notification

.PHONY: help
help: ## Show this help
	@echo "Microservices Reto 4 — Available targets"
	@echo "════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────
# LOCAL DEVELOPMENT
# ──────────────────────────────────────────────
.PHONY: local-up
local-up: ## Start full local stack (Docker Compose + LocalStack)
	docker compose up -d --build
	@echo "⏳ Waiting for services to be healthy..."
	sleep 10
	./scripts/localstack-init.sh
	@echo "✅ Local stack ready at http://localhost:3000"

.PHONY: local-down
local-down: ## Stop local stack
	docker compose down -v

.PHONY: local-logs
local-logs: ## Stream logs from all local services
	docker compose logs -f

.PHONY: local-restart
local-restart: ## Rebuild and restart a specific service (make local-restart SVC=auth)
	docker compose up -d --build $(SVC)-service

# ──────────────────────────────────────────────
# TESTS
# ──────────────────────────────────────────────
.PHONY: test
test: ## Run unit tests for all services
	@for svc in $(SERVICES); do \
	  echo ""; \
	  echo "🧪 Testing $$svc-service..."; \
	  cd services/$$svc && npm ci --silent && npm test -- --forceExit 2>&1 | tail -20; \
	  cd ../..; \
	done

.PHONY: test-service
test-service: ## Run tests for one service (make test-service SVC=auth)
	cd services/$(SVC) && npm ci --silent && npm test -- --forceExit --verbose

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	@for svc in $(SERVICES); do \
	  echo "📊 Coverage for $$svc..."; \
	  cd services/$$svc && npm ci --silent && npm test -- --coverage --forceExit 2>&1 | grep -E "(PASS|FAIL|Coverage|%)" | head -15; \
	  cd ../..; \
	done

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests (requires BASE_URL env var)
	@[ -n "$(BASE_URL)" ] || (echo "❌ Set BASE_URL=https://your-api.execute-api..." && exit 1)
	BASE_URL=$(BASE_URL) ./scripts/test-e2e.sh

# ──────────────────────────────────────────────
# TERRAFORM
# ──────────────────────────────────────────────
.PHONY: tf-init
tf-init: ## Initialize Terraform
	terraform init -upgrade

.PHONY: tf-plan
tf-plan: ## Show Terraform plan
	terraform plan -var="environment=$(ENV)" -out=tfplan.binary
	terraform show -no-color tfplan.binary | head -80

.PHONY: tf-apply
tf-apply: ## Apply Terraform (phased)
	./scripts/deploy.sh $(ENV)

.PHONY: tf-destroy
tf-destroy: ## Destroy all infrastructure (prompts for confirmation)
	./scripts/destroy.sh $(ENV)

.PHONY: tf-output
tf-output: ## Show Terraform outputs
	@echo "=== Terraform Outputs ==="
	@terraform output -json | python3 -c "import sys,json; [print(f'  {k}: {v[\"value\"]}') for k,v in json.load(sys.stdin).items() if not v.get('sensitive')]"

.PHONY: tf-lint
tf-lint: ## Format and validate Terraform
	terraform fmt -recursive
	terraform validate
	@echo "✅ Terraform valid"

# ──────────────────────────────────────────────
# DOCKER / ECR
# ──────────────────────────────────────────────
.PHONY: docker-build
docker-build: ## Build all Docker images locally
	@for svc in $(SERVICES); do \
	  echo "🐳 Building $$svc-service..."; \
	  docker build -t $$svc-service:local ./services/$$svc; \
	done

.PHONY: docker-push
docker-push: ## Build and push all images to ECR (requires AWS_ACCOUNT env var)
	@[ -n "$(AWS_ACCOUNT)" ] || (echo "❌ Set AWS_ACCOUNT=your-account-id" && exit 1)
	@aws ecr get-login-password --region $(REGION) | \
	  docker login --username AWS --password-stdin $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com
	@for svc in $(SERVICES); do \
	  echo "📦 Pushing $$svc-service..."; \
	  docker build -t $$svc-service:latest ./services/$$svc; \
	  docker tag $$svc-service:latest \
	    $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com/$$svc-service:latest; \
	  docker push \
	    $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com/$$svc-service:latest; \
	done
	@echo "✅ All images pushed"

# ──────────────────────────────────────────────
# KUBERNETES
# ──────────────────────────────────────────────
.PHONY: k8s-context
k8s-context: ## Set kubectl context to EKS cluster
	aws eks update-kubeconfig --region $(REGION) --name $(CLUSTER) --alias $(PROJECT)-$(ENV)

.PHONY: k8s-status
k8s-status: ## Show all resources in microservices namespace
	@echo "=== Pods ==="
	kubectl get pods -n $(NAMESPACE) -o wide
	@echo ""
	@echo "=== Services ==="
	kubectl get svc -n $(NAMESPACE)
	@echo ""
	@echo "=== HPA ==="
	kubectl get hpa -n $(NAMESPACE)
	@echo ""
	@echo "=== Ingress ==="
	kubectl get ingress -n $(NAMESPACE)

.PHONY: k8s-logs
k8s-logs: ## Stream logs from a service (make k8s-logs SVC=auth)
	kubectl logs -n $(NAMESPACE) -l app=$(SVC)-service --follow --tail=50

.PHONY: k8s-deploy
k8s-deploy: ## Deploy via Helm
	helm upgrade --install microservices ./helm/microservices \
	  --namespace $(NAMESPACE) \
	  --create-namespace \
	  -f helm/microservices/values-prod.yaml \
	  --set global.imageTag=$(shell git rev-parse --short HEAD) \
	  --set global.registry=$(shell terraform output -json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ecr_registry',{}).get('value','REGISTRY'))") \
	  --atomic \
	  --timeout 300s

.PHONY: k8s-rollback
k8s-rollback: ## Rollback Helm release to previous version
	helm rollback microservices --namespace $(NAMESPACE)

.PHONY: k8s-scale
k8s-scale: ## Scale a service (make k8s-scale SVC=auth REPLICAS=5)
	kubectl scale deployment $(SVC)-service -n $(NAMESPACE) --replicas=$(REPLICAS)

.PHONY: k8s-db-migrate
k8s-db-migrate: ## Run DB migrations via kubectl
	RDS_HOST=$$(terraform output -raw rds_cluster_endpoint); \
	kubectl run db-migrate \
	  --image=postgres:15-alpine \
	  --restart=Never \
	  --namespace=$(NAMESPACE) \
	  --rm --attach \
	  --env="PGPASSWORD=$(TF_VAR_db_password)" \
	  -- psql -h $$RDS_HOST -U dbadmin -d microservicesdb \
	       -f /dev/stdin < docs/migrations.sql

# ──────────────────────────────────────────────
# MONITORING
# ──────────────────────────────────────────────
.PHONY: dashboard
dashboard: ## Open CloudWatch dashboard in browser
	@URL=$$(terraform output -raw cloudwatch_dashboard_url 2>/dev/null || echo "https://$(REGION).console.aws.amazon.com/cloudwatch"); \
	  open "$$URL" 2>/dev/null || xdg-open "$$URL" 2>/dev/null || echo "Open: $$URL"

.PHONY: alarms
alarms: ## List all CloudWatch alarms and their states
	aws cloudwatch describe-alarms \
	  --alarm-name-prefix $(PROJECT)-$(ENV) \
	  --region $(REGION) \
	  --query 'MetricAlarms[*].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
	  --output table

.PHONY: xray-traces
xray-traces: ## Show recent X-Ray service graph
	@START=$$(date -d '1 hour ago' +%s 2>/dev/null || date -v -1H +%s); \
	  END=$$(date +%s); \
	  aws xray get-service-graph --start-time $$START --end-time $$END --region $(REGION) \
	    --query 'Services[*].{Name:Name,Type:Type,ResponseTime:ResponseTimeHistogram}' \
	    --output table 2>/dev/null || echo "X-Ray traces not yet populated"

# ──────────────────────────────────────────────
# UTILITIES
# ──────────────────────────────────────────────
.PHONY: get-token
get-token: ## Get a JWT token for testing (requires BASE_URL)
	@[ -n "$(BASE_URL)" ] || (echo "❌ Set BASE_URL" && exit 1)
	@TOKEN=$$(curl -s -X POST "$(BASE_URL)/auth/login" \
	  -H "Content-Type: application/json" \
	  -d '{"email":"admin@reto4.com","password":"Admin123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))"); \
	  echo ""; \
	  echo "JWT Token:"; \
	  echo "$$TOKEN"; \
	  echo ""; \
	  echo "Usage:  curl -H 'Authorization: Bearer $$TOKEN' $(BASE_URL)/users/me"

.PHONY: install-tools
install-tools: ## Install required CLI tools (macOS with brew)
	brew install terraform awscli kubectl helm jq python3 2>/dev/null || \
	  echo "Install terraform, awscli, kubectl, helm, jq manually for your OS"

.PHONY: clean
clean: ## Remove generated files
	rm -f tfplan.binary
	find . -name "*.tfstate.backup" -delete
	find . -name ".terraform.lock.hcl" -delete 2>/dev/null || true
	docker system prune -f 2>/dev/null || true
	@echo "✅ Cleaned"
