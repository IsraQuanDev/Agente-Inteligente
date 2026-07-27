# Despliegue en Oracle Cloud Infrastructure (OCI)

La ruta más sencilla para el Challenge es una instancia **OCI Compute** con Docker.
Esto cumple el requisito de utilizar al menos un servicio de OCI.

## 1. Crear la instancia

1. En OCI, abre **Compute > Instances > Create instance**.
2. Usa Oracle Linux 8 o 9.
3. Para Always Free, selecciona una forma elegible, por ejemplo Ampere A1 cuando esté disponible.
4. Agrega tu clave SSH pública.
5. En opciones avanzadas, pega el contenido de `cloud-init.yaml`.
6. Crea la instancia y conserva la IP pública.

## 2. Abrir el puerto 8501

En la VCN/subred agrega una regla de ingreso:

- Source CIDR: `0.0.0.0/0`
- IP Protocol: TCP
- Destination port: `8501`

También abre el puerto en el sistema operativo:

```bash
sudo firewall-cmd --permanent --add-port=8501/tcp
sudo firewall-cmd --reload
```

## 3. Clonar y ejecutar

```bash
ssh opc@TU_IP_PUBLICA
git clone https://github.com/TU_USUARIO/santos-pegasus-ai-assistant.git
cd santos-pegasus-ai-assistant
cp .env.example .env
nano .env
docker build -t santos-pegasus-ai-assistant .
docker run -d \
  --name santos-pegasus-agent \
  --restart unless-stopped \
  -p 8501:8501 \
  --env-file .env \
  santos-pegasus-ai-assistant
```

Acceso:

```text
http://TU_IP_PUBLICA:8501
```

## 4. Verificar

```bash
docker ps
docker logs -f santos-pegasus-agent
curl http://localhost:8501/_stcore/health
```

## 5. Evidencia requerida

Guarda en `assets/evidence/`:

- captura de la instancia OCI en estado Running;
- captura de la aplicación abierta mediante la IP pública;
- opcionalmente un GIF o video corto.

No subas claves SSH, archivos `.env`, tokens ni secretos.
