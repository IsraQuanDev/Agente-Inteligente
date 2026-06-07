#!/usr/bin/env bash
# scripts/destroy.sh — Safe infrastructure teardown
# Usage: CONFIRM=yes ./scripts/destroy.sh [dev|staging|prod]

set -euo pipefail
ENV="${1:-prod}"
CLUSTER="ms-reto4-${ENV}-eks"
NAMESPACE="microservices"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "${CONFIRM:-no}" != "yes" ]; then
  echo -e "${RED}⚠️  This will destroy ALL infrastructure for environment: ${ENV}${NC}"
  echo ""
  read -p "Type 'destroy ${ENV}' to confirm: " CONFIRMATION
  [ "$CONFIRMATION" == "destroy ${ENV}" ] || { echo "Aborted."; exit 1; }
fi

echo -e "${YELLOW}Starting destruction sequence for: ${ENV}${NC}"

# Step 1: Drain Kubernetes resources
echo "1️⃣  Removing Kubernetes resources..."
if aws eks describe-cluster --name "${CLUSTER}" --region us-east-1 &>/dev/null; then
  aws eks update-kubeconfig --region us-east-1 --name "${CLUSTER}" 2>/dev/null || true
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true --timeout=60s || true
  echo -e "   ${GREEN}✓ Namespace deleted${NC}"
fi

# Step 2: Remove deletion protection from RDS
echo "2️⃣  Disabling RDS deletion protection..."
aws rds modify-db-cluster \
  --db-cluster-identifier "ms-reto4-${ENV}-aurora" \
  --no-deletion-protection \
  --apply-immediately \
  --region us-east-1 2>/dev/null || echo "   (RDS cluster may not exist)"
sleep 10

# Step 3: Destroy Terraform in safe order
echo "3️⃣  Destroying Terraform resources..."
terraform destroy \
  -target=module.api_gateway \
  -target=module.cloudwatch \
  -target=module.waf \
  -auto-approve -var="environment=${ENV}" 2>&1 | tail -5

terraform destroy \
  -target=module.eks \
  -auto-approve -var="environment=${ENV}" 2>&1 | tail -5

terraform destroy \
  -target=module.sqs \
  -target=module.elasticache \
  -auto-approve -var="environment=${ENV}" 2>&1 | tail -5

terraform destroy \
  -target=module.rds \
  -auto-approve -var="environment=${ENV}" 2>&1 | tail -5

terraform destroy \
  -auto-approve -var="environment=${ENV}" 2>&1 | tail -5

echo ""
echo -e "${GREEN}════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Infrastructure destroyed for: ${ENV}${NC}"
echo -e "${GREEN}════════════════════════════════════${NC}"
echo ""
echo "Optional cleanup:"
echo "  aws s3 rb s3://tf-state-microservices-reto4 --force"
echo "  aws dynamodb delete-table --table-name tf-state-lock"
