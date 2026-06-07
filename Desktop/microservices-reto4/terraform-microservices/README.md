# 🏗️ Microservices Cloud Architecture — Reto 4

> **Arquitectura cloud de microservicios segura, escalable y observable** desplegada con Terraform sobre AWS EKS, con autenticación JWT en API Gateway, WAF, Aurora, ElastiCache Redis, SQS/SNS y CloudWatch/X-Ray.

---

## 📐 Arquitectura

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AWS Cloud  (us-east-1)                                              │
│                                                                      │
│  ┌──────────────┐    ┌────────────────────────────────────────────┐  │
│  │  CloudFront  │    │  WAF WebACL (rate-limit, SQLi, bad agents) │  │
│  └──────┬───────┘    └───────────────────┬────────────────────────┘  │
│         │                                │                           │
│         ▼                                ▼                           │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  API Gateway (HTTP API v2)                                   │    │
│  │  JWT Authorizer ──► validates token before routing           │    │
│  │  Routes: /auth  /users  /products  /orders  /payments  /notif│    │
│  └───────────────────────┬──────────────────────────────────────┘    │
│                          │ VPC Link                                  │
│  ┌───────────────────────▼──────────────────────────────────────┐    │
│  │  VPC  10.0.0.0/16                                            │    │
│  │                                                              │    │
│  │  Public Subnets (10.0.1.0/24, 10.0.2.0/24)                  │    │
│  │  ┌──────────────┐  ┌──────────────┐                         │    │
│  │  │  NAT GW AZ-1 │  │  NAT GW AZ-2 │                         │    │
│  │  └──────────────┘  └──────────────┘                         │    │
│  │                                                              │    │
│  │  Private Subnets (10.0.10.0/24, 10.0.20.0/24)               │    │
│  │  ┌────────────────────────────────────────────┐             │    │
│  │  │  EKS Cluster  (namespace: microservices)   │             │    │
│  │  │                                            │             │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌─────────┐  │             │    │
│  │  │  │  auth    │  │  user    │  │ product │  │             │    │
│  │  │  │ :8080    │  │ :8081    │  │  :8082  │  │             │    │
│  │  │  └──────────┘  └──────────┘  └─────────┘  │             │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌─────────┐  │             │    │
│  │  │  │  order   │  │ payment  │  │notifica │  │             │    │
│  │  │  │ :8083    │  │  :8084   │  │  :8085  │  │             │    │
│  │  │  └────┬─────┘  └────┬─────┘  └────┬────┘  │             │    │
│  │  └───────┼─────────────┼─────────────┼────────┘             │    │
│  │          │  SQS/SNS    │             │                      │    │
│  │  ┌───────▼─────────────▼─────────────▼──────┐               │    │
│  │  │  Amazon SQS                              │               │    │
│  │  │  order-events │ payment-events │ notif.. │               │    │
│  │  └──────────────────────────────────────────┘               │    │
│  │                                                              │    │
│  │  ┌──────────────────────┐  ┌──────────────────────────────┐  │    │
│  │  │  Aurora PostgreSQL   │  │  ElastiCache Redis (cluster) │  │    │
│  │  │  Writer + Reader     │  │  Primary + Replica           │  │    │
│  │  │  Multi-AZ            │  │  Multi-AZ                    │  │    │
│  │  └──────────────────────┘  └──────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Observability                                                  │  │
│  │  CloudWatch Logs • Container Insights • X-Ray • Alarms • Dash  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  S3 (assets + logs)   •   IAM Roles/IRSA   •   Secrets Manager      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisitos

| Herramienta        | Versión mínima |
|--------------------|----------------|
| Terraform          | ≥ 1.6.0        |
| AWS CLI            | ≥ 2.x          |
| kubectl            | ≥ 1.29         |
| Helm               | ≥ 3.13         |
| Docker             | ≥ 24.x         |

### Permisos AWS requeridos
La cuenta/usuario debe tener acceso a: EC2, VPC, EKS, RDS, ElastiCache, SQS, SNS, S3, API Gateway, WAF, CloudWatch, IAM, Secrets Manager, ECR.

---

## 🚀 Guía de Despliegue

### 1. Clonar y configurar

```bash
git clone https://github.com/your-org/terraform-microservices-reto4.git
cd terraform-microservices-reto4

# Configurar credenciales AWS
aws configure --profile reto4
export AWS_PROFILE=reto4
export AWS_REGION=us-east-1
```

### 2. Crear backend de estado (una sola vez)

```bash
# Crear el bucket S3 para el estado de Terraform
aws s3 mb s3://tf-state-microservices-reto4 --region us-east-1
aws s3api put-bucket-versioning \
  --bucket tf-state-microservices-reto4 \
  --versioning-configuration Status=Enabled

# Crear tabla DynamoDB para el lock
aws dynamodb create-table \
  --table-name tf-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

echo "✅ Backend S3 + DynamoDB listo"
```

### 3. Configurar variables

```bash
cp terraform.tfvars.example terraform.tfvars

# Editar con tus valores reales
# IMPORTANTE: jwt_issuer, jwt_audience, db_password, alarm_email
nano terraform.tfvars
```

### 4. Inicializar Terraform

```bash
terraform init

# Verificar plan completo
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary | jq '.resource_changes | length'
```

### 5. Aplicar infraestructura (por fases)

```bash
# Fase 1: Red (VPC, Subnets, NAT Gateways)
terraform apply -target=module.vpc -target=module.security_groups -auto-approve
echo "✅ VPC lista"

# Fase 2: IAM y almacenamiento
terraform apply -target=module.iam -target=module.s3 -auto-approve
echo "✅ IAM + S3 listos"

# Fase 3: Bases de datos
terraform apply -target=module.rds -target=module.elasticache -auto-approve
echo "⏳ Aurora puede tardar 8-10 min..."

# Fase 4: Mensajería
terraform apply -target=module.sqs -auto-approve

# Fase 5: EKS (la más larga, ~15-20 min)
terraform apply -target=module.eks -auto-approve
echo "⏳ EKS cluster + node groups..."

# Fase 6: WAF + API Gateway + CloudWatch
terraform apply -auto-approve
echo "✅ Infraestructura completa"
```

### 6. Configurar kubectl

```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name ms-reto4-prod-eks \
  --alias reto4

kubectl get nodes
kubectl get namespaces
```

### 7. Construir y publicar imágenes Docker

```bash
# Login a ECR
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS \
  --password-stdin ${AWS_ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com

# Crear repositorios ECR
for svc in auth user product order payment notification; do
  aws ecr create-repository \
    --repository-name ${svc}-service \
    --image-scanning-configuration scanOnPush=true \
    --region us-east-1
done

# Build y push (desde cada servicio)
for svc in auth user product order payment notification; do
  docker build -t ${svc}-service ./services/${svc}
  docker tag ${svc}-service:latest \
    ${AWS_ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/${svc}-service:latest
  docker push \
    ${AWS_ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/${svc}-service:latest
  echo "✅ ${svc}-service publicado"
done
```

### 8. Desplegar Kubernetes

```bash
# Obtener valores dinámicos de Terraform
RDS_ENDPOINT=$(terraform output -raw rds_cluster_endpoint)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)

# Crear secrets de Kubernetes (en prod usar External Secrets Operator)
kubectl create secret generic db-secrets \
  --namespace=microservices \
  --from-literal=host=${RDS_ENDPOINT} \
  --from-literal=username=dbadmin \
  --from-literal=password=YOUR_DB_PASSWORD

kubectl create secret generic redis-secrets \
  --namespace=microservices \
  --from-literal=host=${REDIS_ENDPOINT}

kubectl create secret generic jwt-secrets \
  --namespace=microservices \
  --from-literal=jwt-secret=YOUR_256BIT_SECRET \
  --from-literal=jwt-issuer=https://your-auth.auth0.com/

kubectl create secret generic payment-secrets \
  --namespace=microservices \
  --from-literal=stripe-secret-key=sk_live_xxx

# Sustituir ACCOUNT_ID en manifests
sed -i "s/ACCOUNT_ID/${AWS_ACCOUNT}/g" k8s/*.yaml

# Aplicar manifests
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-auth-service.yaml
kubectl apply -f k8s/02-06-services.yaml
kubectl apply -f k8s/07-secrets-ingress-netpol.yaml

# Verificar deployments
kubectl get pods -n microservices -w
kubectl get hpa -n microservices
kubectl get ingress -n microservices
```

### 9. Configurar dominio y DNS

```bash
# Obtener URL de API Gateway
API_URL=$(terraform output -raw api_gateway_url)
echo "🌐 API Gateway URL: ${API_URL}"

# El NLB del ingress lo puedes vincular a Route53 / tu DNS
NLB_DNS=$(kubectl get ingress microservices-ingress \
  -n microservices \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "🔗 NLB DNS: ${NLB_DNS}"
```

---

## 🔐 Autenticación JWT

### Flujo completo

```
Cliente                     API Gateway              Microservicio
  │                             │                         │
  ├─ POST /auth/login ─────────►│                         │
  │  (no requiere JWT)          │──────────────────────►  │ auth-service
  │◄─────────────── accessToken │◄──────────────────────  │
  │                             │                         │
  ├─ GET /users/me ────────────►│                         │
  │  Authorization: Bearer <JWT>│                         │
  │                             │ JWT Authorizer valida   │
  │                             │ issuer + audience + exp │
  │                             │─────────────────────── ►│ user-service
  │◄─────────────── 200 profile │◄──────────────────────  │
```

### Headers inyectados por API Gateway a los servicios

| Header               | Valor                            |
|----------------------|----------------------------------|
| `X-JWT-Subject`      | `sub` claim del JWT              |
| `X-JWT-Email`        | `email` claim del JWT            |
| `X-Forwarded-For`    | IP del cliente                   |
| `X-Request-ID`       | ID único de la petición          |

---

## 📡 Endpoints Documentados

### Base URL
```
https://{api-id}.execute-api.us-east-1.amazonaws.com/prod
```

### Auth Service — `/auth` (público)

| Método | Path              | Descripción                    | Auth  |
|--------|-------------------|--------------------------------|-------|
| POST   | `/auth/register`  | Registrar nuevo usuario        | ❌ No |
| POST   | `/auth/login`     | Login → JWT + refresh token    | ❌ No |
| POST   | `/auth/refresh`   | Renovar access token           | ❌ No |
| GET    | `/auth/validate`  | Validar token actual           | ✅ JWT |
| POST   | `/auth/logout`    | Revocar refresh token          | ✅ JWT |

### User Service — `/users`

| Método | Path              | Descripción                    | Auth  |
|--------|-------------------|--------------------------------|-------|
| GET    | `/users/me`       | Obtener mi perfil              | ✅ JWT |
| PUT    | `/users/me`       | Actualizar mi perfil           | ✅ JWT |
| DELETE | `/users/me`       | Eliminar mi cuenta             | ✅ JWT |
| GET    | `/users/{id}`     | Obtener usuario por ID (admin) | ✅ JWT |
| GET    | `/users`          | Listar usuarios (admin)        | ✅ JWT |

### Product Service — `/products`

| Método | Path                       | Descripción              | Auth  |
|--------|----------------------------|--------------------------|-------|
| GET    | `/products`                | Listar productos         | ✅ JWT |
| GET    | `/products/{id}`           | Obtener producto         | ✅ JWT |
| POST   | `/products`                | Crear producto (admin)   | ✅ JWT |
| PUT    | `/products/{id}`           | Actualizar producto      | ✅ JWT |
| DELETE | `/products/{id}`           | Eliminar producto        | ✅ JWT |
| PATCH  | `/products/{id}/stock`     | Ajustar inventario       | ✅ JWT |

### Order Service — `/orders`

| Método | Path                     | Descripción              | Auth  |
|--------|--------------------------|--------------------------|-------|
| POST   | `/orders`                | Crear orden              | ✅ JWT |
| GET    | `/orders`                | Mis órdenes              | ✅ JWT |
| GET    | `/orders/{id}`           | Detalle de orden         | ✅ JWT |
| PATCH  | `/orders/{id}/cancel`    | Cancelar orden           | ✅ JWT |
| PATCH  | `/orders/{id}/status`    | Actualizar estado (admin)| ✅ JWT |

### Payment Service — `/payments`

| Método | Path                         | Descripción              | Auth  |
|--------|------------------------------|--------------------------|-------|
| POST   | `/payments/intent`           | Crear intent de pago     | ✅ JWT |
| POST   | `/payments/{id}/confirm`     | Confirmar pago           | ✅ JWT |
| GET    | `/payments/{id}`             | Estado del pago          | ✅ JWT |
| POST   | `/payments/{id}/refund`      | Reembolso (admin)        | ✅ JWT |

### Notification Service — `/notifications`

| Método | Path                              | Descripción              | Auth  |
|--------|-----------------------------------|--------------------------|-------|
| GET    | `/notifications`                  | Mis notificaciones       | ✅ JWT |
| PATCH  | `/notifications/mark-read`        | Marcar como leídas       | ✅ JWT |
| PUT    | `/notifications/preferences`      | Preferencias de notif.   | ✅ JWT |

---

## 📊 Observabilidad

### CloudWatch Dashboard
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=ms-reto4-prod
```

### Métricas clave
- API Gateway: Count, Latency (p50/p99), 4xx/5xx errors
- EKS: node_cpu_utilization, node_memory_utilization
- RDS: CPUUtilization, DatabaseConnections, ReadLatency
- SQS: ApproximateNumberOfMessagesNotVisible (DLQ alerts)
- JWT: Auth failures (métrica personalizada)

### Logs
```bash
# Logs de API Gateway
aws logs tail /aws/apigateway/ms-reto4-prod --follow

# Logs de un servicio EKS
kubectl logs -n microservices -l app=auth-service --follow

# X-Ray traces
aws xray get-service-graph \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s)
```

### Alarmas configuradas
| Alarma                      | Umbral           | Acción          |
|-----------------------------|------------------|-----------------|
| API Gateway 5xx errors      | > 10 en 1 min   | SNS → Email     |
| RDS CPU                     | > 80% por 3 min | SNS → Email     |
| DLQ con mensajes            | > 0             | SNS → Email     |
| JWT Auth failures           | > 50 en 5 min   | SNS → Email     |

---

## ⚡ Escalabilidad Horizontal

### HPA por servicio
```bash
# Ver autoscalers activos
kubectl get hpa -n microservices

# Simular carga para ver scaling
kubectl run load-test \
  --image=busybox \
  --namespace=microservices \
  --restart=Never \
  -- /bin/sh -c "while true; do wget -q -O- http://user-service:8081/health; done"

# Observar escalado en tiempo real
watch kubectl get pods -n microservices
```

### Cluster Autoscaler (EKS node scaling)
El Cluster Autoscaler detecta pods Pending y escala los nodos EC2 automáticamente (min=2, max=10).

---

## 🔥 Pruebas

### 1. Prueba completa de flujo JWT
```bash
BASE_URL=$(terraform output -raw api_gateway_url)

# Paso 1: Registrar usuario
REGISTER=$(curl -s -X POST ${BASE_URL}/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@reto4.com","password":"Test1234!","firstName":"Test","lastName":"User"}')
echo $REGISTER | jq .

# Paso 2: Login y obtener token
TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@reto4.com","password":"Test1234!"}' | jq -r .accessToken)
echo "🔑 JWT: ${TOKEN:0:30}..."

# Paso 3: Intentar acceso sin token (debe retornar 401)
curl -s -o /dev/null -w "%{http_code}" ${BASE_URL}/users/me
# Expected: 401

# Paso 4: Acceso con token (debe retornar 200)
curl -s -H "Authorization: Bearer ${TOKEN}" ${BASE_URL}/users/me | jq .
# Expected: 200 con perfil de usuario

# Paso 5: Crear producto
PRODUCT_ID=$(curl -s -X POST ${BASE_URL}/products \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","price":99.99,"stock":50,"sku":"TEST-001"}' | jq -r .id)

# Paso 6: Crear orden
ORDER_ID=$(curl -s -X POST ${BASE_URL}/orders \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"productId\":\"${PRODUCT_ID}\",\"quantity\":1}]}" | jq -r .id)

echo "✅ Flujo completo OK — Order: ${ORDER_ID}"
```

### 2. Prueba de WAF (rate limiting)
```bash
# Generar 2001 requests rápidas — WAF debe bloquear
for i in $(seq 1 2001); do
  curl -s -o /dev/null -w "%{http_code}\n" ${BASE_URL}/health
done | sort | uniq -c
# Expected: mezcla de 200 y 429
```

### 3. Prueba de HA (alta disponibilidad)
```bash
# Ver distribución de pods por AZ
kubectl get pods -n microservices -o wide | awk '{print $7}' | sort | uniq -c

# Simular falla de nodo
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
kubectl cordon ${NODE}
kubectl drain ${NODE} --ignore-daemonsets --delete-emptydir-data

# Verificar que los pods migraron al otro AZ
kubectl get pods -n microservices -o wide
kubectl uncordon ${NODE}
```

---

## 💥 Destroy (Eliminación de infraestructura)

```bash
# ⚠️  ADVERTENCIA: esto elimina TODA la infraestructura

# Paso 1: Eliminar recursos de Kubernetes primero
kubectl delete namespace microservices

# Paso 2: Eliminar recursos Terraform en orden inverso
terraform destroy -target=module.api_gateway -auto-approve
terraform destroy -target=module.waf -auto-approve
terraform destroy -target=module.cloudwatch -auto-approve
terraform destroy -target=module.eks -auto-approve
terraform destroy -target=module.sqs -auto-approve
terraform destroy -target=module.elasticache -auto-approve

# Para RDS: primero deshabilitar deletion protection
aws rds modify-db-cluster \
  --db-cluster-identifier ms-reto4-prod-aurora \
  --no-deletion-protection \
  --apply-immediately
terraform destroy -target=module.rds -auto-approve

# Destruir el resto
terraform destroy -auto-approve

# Paso 3: Limpiar backend (opcional)
aws s3 rb s3://tf-state-microservices-reto4 --force
aws dynamodb delete-table --table-name tf-state-lock

echo "🗑️  Infraestructura eliminada"
```

---

## 📁 Estructura del Proyecto

```
terraform-microservices/
├── main.tf                          # Módulos principales + providers
├── variables.tf                     # Definición de variables
├── outputs.tf                       # Outputs del stack
├── terraform.tfvars.example         # Template de configuración
├── modules/
│   ├── vpc/                         # VPC, subnets, NAT, flow logs
│   ├── security-groups/             # SGs para EKS, RDS, Redis, ALB
│   ├── iam/                         # Roles para EKS, nodes, API GW
│   ├── eks/                         # Cluster, node groups, OIDC, Helm
│   ├── rds/                         # Aurora PostgreSQL Multi-AZ
│   ├── elasticache/                 # Redis cluster Multi-AZ
│   ├── sqs/                         # Queues + DLQ + SNS topic
│   ├── s3/                          # Buckets assets + logs
│   ├── waf/                         # WAF v2 + managed rules
│   ├── api-gateway/                 # HTTP API + JWT authorizer + routes
│   └── cloudwatch/                  # Dashboard + alarms + log groups
├── k8s/
│   ├── 00-namespace.yaml            # Namespace + ConfigMap + HPA template
│   ├── 01-auth-service.yaml         # Auth: Deployment + Service + HPA
│   ├── 02-06-services.yaml          # User, Product, Order, Payment, Notification
│   └── 07-secrets-ingress-netpol.yaml # Secrets + Ingress + NetworkPolicies
├── postman/
│   ├── microservices-reto4.postman_collection.json
│   └── microservices-reto4.postman_environment.json
└── README.md
```

---

## 🛡️ Seguridad

- **JWT** validado en API Gateway antes de llegar a los servicios
- **WAF** con reglas OWASP managed + rate limiting (2000 req/IP/min)
- **Network Policies** en Kubernetes: deny-all por defecto
- **Security Groups**: RDS y Redis sólo accesibles desde EKS nodes
- **Encryption at rest**: RDS (KMS), Redis (KMS), S3 (KMS/AES-256), SQS (KMS)
- **Encryption in transit**: TLS en Redis, RDS, ALB/NLB
- **Secrets Manager**: credenciales de DB fuera del código
- **IRSA**: pods con roles IAM mínimos via Service Account annotations
- **VPC Flow Logs**: tráfico de red auditado en CloudWatch
- **EKS endpoint privado**: cluster API no expuesto a internet

---

## 🔧 Variables de Entorno por Servicio

| Variable           | Auth | User | Product | Order | Payment | Notification |
|--------------------|------|------|---------|-------|---------|--------------|
| `DB_HOST`          | ✅   | ✅   | ✅      | ✅    | ✅      | ❌           |
| `REDIS_HOST`       | ✅   | ✅   | ✅      | ❌    | ❌      | ❌           |
| `JWT_SECRET`       | ✅   | ❌   | ❌      | ❌    | ❌      | ❌           |
| `JWT_ISSUER`       | ✅   | ✅   | ✅      | ✅    | ✅      | ❌           |
| `ORDER_QUEUE_URL`  | ❌   | ❌   | ❌      | ✅    | ❌      | ❌           |
| `PAYMENT_QUEUE_URL`| ❌   | ❌   | ❌      | ❌    | ✅      | ❌           |
| `NOTIF_QUEUE_URL`  | ❌   | ❌   | ❌      | ❌    | ❌      | ✅           |
| `SNS_TOPIC_ARN`    | ❌   | ❌   | ❌      | ✅    | ✅      | ❌           |
| `S3_BUCKET`        | ❌   | ❌   | ✅      | ❌    | ❌      | ✅           |
| `STRIPE_KEY`       | ❌   | ❌   | ❌      | ❌    | ✅      | ❌           |

---

## 💰 Estimación de Costo (us-east-1)

| Recurso                    | Tipo               | Costo/mes (~) |
|----------------------------|--------------------|---------------|
| EKS Cluster                | Control plane      | $73           |
| EC2 Nodes (3x t3.medium)   | Worker nodes       | $95           |
| Aurora PostgreSQL          | db.r6g.large x2    | $280          |
| ElastiCache Redis          | cache.t3.micro x2  | $26           |
| NAT Gateways               | 2x AZ              | $65           |
| API Gateway HTTP           | ~1M requests       | $3.50         |
| CloudWatch                 | Logs + Metrics     | $20           |
| S3                         | 50GB               | $1.15         |
| SQS                        | ~1M messages       | $0.40         |
| **Total estimado**         |                    | **~$565/mes** |

*Usar `terraform plan` + AWS Pricing Calculator para cifras exactas.*

---

Hecho con ❤️ para el Reto 4 — Arquitectura Cloud de Microservicios
