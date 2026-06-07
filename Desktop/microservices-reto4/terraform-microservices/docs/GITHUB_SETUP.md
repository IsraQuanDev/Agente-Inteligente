# 🚀 Guía para subir a GitHub

## Pasos previos (obligatorios)

### 1. Verificar que NO hay secretos en el repo
```bash
# Instalar gitleaks (detector de secretos)
brew install gitleaks   # macOS
# o: https://github.com/gitleaks/gitleaks/releases

# Escanear antes de hacer push
gitleaks detect --source . --verbose
# Resultado esperado: "No leaks found"
```

### 2. Configurar GitHub Secrets (Settings → Secrets → Actions)

Ve a tu repo → **Settings → Secrets and variables → Actions** y agrega:

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `AWS_ACCOUNT_ID` | `123456789012` | Tu account ID de AWS |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack...` | Para notificaciones (opcional) |

> El CI/CD usa **OIDC** (no access keys hardcodeadas). El rol IAM se crea con Terraform.

### 3. Crear el repo en GitHub
```bash
# Desde la carpeta del proyecto
cd terraform-microservices

git init
git add .
git commit -m "feat: microservices cloud architecture reto4

- Terraform: VPC, EKS, Aurora, Redis, SQS/SNS, S3, API Gateway, WAF
- 6 microservicios (auth/user/product/order/payment/notification)
- JWT auth via API Gateway JWT Authorizer
- Kubernetes manifests + Helm chart
- 54 unit tests (Jest)
- CI/CD GitHub Actions con Trivy + tfsec
- CloudWatch dashboard + alarms
- Postman collection + E2E tests
- docker-compose para desarrollo local"

# Conectar al repo remoto (créalo primero en github.com)
git remote add origin https://github.com/TU_USUARIO/microservices-reto4.git
git branch -M main
git push -u origin main
```

### 4. Verificar en GitHub
- ✅ Actions tab → debe aparecer el workflow `CI/CD — Build, Test & Deploy`
- ✅ El workflow de PR corre lint + tests automáticamente
- ✅ El push a `main` dispara build + push a ECR + deploy a EKS

---

## Estructura del repositorio en GitHub

```
microservices-reto4/
├── 📄 README.md              ← Documentación principal
├── 📄 EVIDENCE.md            ← Evidencia de pruebas
├── 📄 Makefile               ← Comandos unificados
├── 📄 docker-compose.yml     ← Desarrollo local
├── 📄 terraform.tfvars.example ← Template (SIN secretos)
├── 🔧 main.tf / variables.tf / outputs.tf
├── 📁 modules/               ← 10 módulos Terraform
├── 📁 services/              ← 6 microservicios (Node.js)
│   └── {service}/
│       ├── Dockerfile
│       ├── package.json
│       ├── jest.config.js
│       └── src/
│           ├── index.js
│           └── __tests__/
├── 📁 k8s/                   ← Manifests Kubernetes
├── 📁 helm/microservices/    ← Helm chart
├── 📁 postman/               ← Colección + environment
├── 📁 scripts/               ← deploy.sh / destroy.sh / test-e2e.sh
├── 📁 docs/                  ← migrations.sql / nginx-local.conf
└── 📁 .github/workflows/     ← CI/CD pipeline
```

---

## Configurar branch protection (recomendado)

Settings → Branches → Add rule → `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass (selecciona: `Test`, `terraform-validate`)
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

---

## Checklist final antes del push

- [ ] `terraform.tfvars` NO existe en el directorio (o está en `.gitignore`)
- [ ] No hay access keys de AWS en ningún archivo
- [ ] `gitleaks detect --source .` no reporta nada
- [ ] `terraform.tfvars.example` tiene sólo valores de ejemplo
- [ ] Los Secrets de GitHub están configurados
- [ ] El README.md tiene tu nombre/equipo en maintainers
