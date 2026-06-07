#!/usr/bin/env bash
# scripts/deploy.sh — Full deployment helper
# Usage: ./scripts/deploy.sh [dev|staging|prod]

set -euo pipefail
ENV="${1:-prod}"
REGION="us-east-1"
PROJECT="ms-reto4"
CLUSTER="${PROJECT}-${ENV}-eks"
NAMESPACE="microservices"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +'%H:%M:%S')] $*${NC}"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
die()  { echo -e "${RED}❌ $*${NC}"; exit 1; }

# ── Pre-flight checks ─────────────────────────
log "Pre-flight checks..."
command -v terraform >/dev/null || die "terraform not found"
command -v aws       >/dev/null || die "aws cli not found"
command -v kubectl   >/dev/null || die "kubectl not found"
command -v helm      >/dev/null || die "helm not found"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || die "AWS credentials not configured"
ok "AWS account: ${ACCOUNT}"

# ── Terraform ─────────────────────────────────
log "Applying Terraform..."
terraform init -input=false
terraform plan -var="environment=${ENV}" -out=tfplan.binary -input=false
terraform apply tfplan.binary
ok "Infrastructure ready"

# ── kubeconfig ────────────────────────────────
log "Updating kubeconfig..."
aws eks update-kubeconfig --region "${REGION}" --name "${CLUSTER}" --alias "${PROJECT}-${ENV}"
kubectl get nodes | grep -v NotReady | grep -c Ready | xargs -I{} echo "Nodes ready: {}"

# ── Secrets from Terraform outputs ───────────
log "Injecting Kubernetes secrets from Terraform outputs..."
RDS_HOST=$(terraform output -raw rds_cluster_endpoint)
REDIS_HOST=$(terraform output -raw redis_endpoint)

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic db-secrets \
  --namespace="${NAMESPACE}" \
  --from-literal=host="${RDS_HOST}" \
  --from-literal=username="dbadmin" \
  --from-literal=password="${TF_VAR_db_password:?TF_VAR_db_password not set}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic redis-secrets \
  --namespace="${NAMESPACE}" \
  --from-literal=host="${REDIS_HOST}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic jwt-secrets \
  --namespace="${NAMESPACE}" \
  --from-literal=jwt-secret="${JWT_SECRET:?JWT_SECRET not set}" \
  --from-literal=jwt-issuer="${JWT_ISSUER:?JWT_ISSUER not set}" \
  --dry-run=client -o yaml | kubectl apply -f -

ok "Secrets injected"

# ── Run DB migrations ─────────────────────────
log "Running database migrations..."
kubectl run db-migrate \
  --image="postgres:15-alpine" \
  --restart=Never \
  --namespace="${NAMESPACE}" \
  --rm \
  --env="PGPASSWORD=${TF_VAR_db_password}" \
  --attach \
  --wait \
  -- psql -h "${RDS_HOST}" -U dbadmin -d microservicesdb \
       -f /dev/stdin < docs/migrations.sql
ok "Migrations complete"

# ── Deploy Kubernetes manifests ───────────────
log "Deploying Kubernetes manifests..."
sed "s/ACCOUNT_ID/${ACCOUNT}/g" k8s/00-namespace.yaml | kubectl apply -f -
sed "s/ACCOUNT_ID/${ACCOUNT}/g" k8s/01-auth-service.yaml | kubectl apply -f -
sed "s/ACCOUNT_ID/${ACCOUNT}/g" k8s/02-06-services.yaml | kubectl apply -f -
kubectl apply -f k8s/07-secrets-ingress-netpol.yaml

# ── Wait for rollout ──────────────────────────
log "Waiting for all deployments to be ready..."
for SVC in auth-service user-service product-service order-service payment-service notification-service; do
  kubectl rollout status "deployment/${SVC}" -n "${NAMESPACE}" --timeout=300s
  ok "${SVC} ready"
done

# ── Smoke tests ───────────────────────────────
log "Running smoke tests..."
API_URL=$(terraform output -raw api_gateway_url)

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health")
[ "${HTTP_STATUS}" == "200" ] && ok "Health endpoint: ${HTTP_STATUS}" || warn "Health endpoint returned: ${HTTP_STATUS}"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/users/me")
[ "${HTTP_STATUS}" == "401" ] && ok "JWT enforcement active (401 without token)" || warn "Expected 401, got: ${HTTP_STATUS}"

echo ""
echo "════════════════════════════════════════════════"
ok "Deployment complete!"
echo -e "  API URL:    ${CYAN}${API_URL}${NC}"
echo -e "  Dashboard:  ${CYAN}https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${PROJECT}-${ENV}${NC}"
echo "════════════════════════════════════════════════"
