#!/usr/bin/env bash
# scripts/localstack-init.sh
# Run AFTER docker compose up to create local AWS resources via LocalStack
# Usage: ./scripts/localstack-init.sh

set -euo pipefail

LS="http://localhost:4566"
REGION="us-east-1"
ACCT="000000000000"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()  { echo -e "${GREEN}✅ $*${NC}"; }
log() { echo -e "${CYAN}▶  $*${NC}"; }

export AWS_DEFAULT_REGION=$REGION
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_ENDPOINT_URL=$LS

log "Waiting for LocalStack to be ready..."
until curl -sf "${LS}/_localstack/health" | grep -q '"sqs": "running"'; do
  sleep 2
done
ok "LocalStack ready"

# ── SQS Queues ──────────────────────────────────
log "Creating SQS queues..."
for QUEUE in ms-reto4-dev-order-events ms-reto4-dev-payment-events ms-reto4-dev-notification-events; do
  aws sqs create-queue --queue-name "${QUEUE}" --endpoint-url "$LS" >/dev/null
  ok "Queue: ${QUEUE}"
done

# DLQs
for QUEUE in ms-reto4-dev-order-dlq ms-reto4-dev-payment-dlq ms-reto4-dev-notification-dlq; do
  aws sqs create-queue --queue-name "${QUEUE}" --endpoint-url "$LS" >/dev/null
  ok "DLQ: ${QUEUE}"
done

# ── SNS Topic ────────────────────────────────────
log "Creating SNS topic..."
TOPIC_ARN=$(aws sns create-topic \
  --name ms-reto4-dev-events \
  --endpoint-url "$LS" \
  --query TopicArn --output text)
ok "SNS Topic: ${TOPIC_ARN}"

# Subscribe queues to SNS
log "Subscribing queues to SNS..."
ORDER_URL="http://sqs.${REGION}.localhost.localstack.cloud:4566/${ACCT}/ms-reto4-dev-order-events"
NOTIF_URL="http://sqs.${REGION}.localhost.localstack.cloud:4566/${ACCT}/ms-reto4-dev-notification-events"
ORDER_ARN="arn:aws:sqs:${REGION}:${ACCT}:ms-reto4-dev-order-events"
NOTIF_ARN="arn:aws:sqs:${REGION}:${ACCT}:ms-reto4-dev-notification-events"

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$ORDER_ARN" \
  --endpoint-url "$LS" >/dev/null
ok "Subscribed order queue to SNS"

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$NOTIF_ARN" \
  --endpoint-url "$LS" >/dev/null
ok "Subscribed notification queue to SNS"

# ── S3 Bucket ────────────────────────────────────
log "Creating S3 bucket..."
aws s3 mb "s3://ms-reto4-dev-assets" --endpoint-url "$LS" 2>/dev/null || true
ok "Bucket: ms-reto4-dev-assets"

# ── SES (verify sender) ──────────────────────────
log "Verifying SES sender..."
aws ses verify-email-identity \
  --email-address noreply@localhost \
  --endpoint-url "$LS" >/dev/null
ok "SES sender verified"

# ── Secrets Manager ──────────────────────────────
log "Creating local secrets..."
aws secretsmanager create-secret \
  --name "ms-reto4/dev/rds/credentials" \
  --secret-string '{"username":"dbadmin","password":"localdevpassword","host":"postgres","port":5432,"dbname":"microservicesdb"}' \
  --endpoint-url "$LS" >/dev/null 2>&1 || true
ok "Secret: rds/credentials"

echo ""
echo "════════════════════════════════════════════════"
ok "LocalStack resources ready for local development"
echo ""
echo "  Queue URLs:"
echo "    ${CYAN}${ORDER_URL}${NC}"
echo "    ${CYAN}${NOTIF_URL}${NC}"
echo "  SNS Topic ARN: ${CYAN}${TOPIC_ARN}${NC}"
echo "════════════════════════════════════════════════"
