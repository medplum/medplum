# Medplum Kubernetes Local Deployment

A complete guide to deploy Medplum on Docker Desktop Kubernetes for local development.

## 🎯 Overview

This guide provides a simple, step-by-step process to deploy the Medplum healthcare platform on your local machine using Docker Desktop's built-in Kubernetes cluster. 

**What you'll get:**
- 🏥 Medplum FHIR server running on http://localhost:8103
- 🗄️ PostgreSQL database for data storage
- ⚡ Redis cache for performance
- 🔧 Development-ready configuration
- 🧹 Easy cleanup and redeployment

## 📋 Prerequisites

Before starting, ensure you have:

### Required Software
- **Docker Desktop** (latest version)
- **kubectl** command-line tool
- **Helm** v3.x

### Docker Desktop Configuration
1. Open Docker Desktop
2. Go to **Settings** → **Kubernetes**
3. Check **"Enable Kubernetes"**
4. Click **"Apply & Restart"**
5. Wait for Kubernetes to start (green indicator)

### Verify Setup
```bash
# Verify kubectl is pointing to Docker Desktop
kubectl config current-context
# Should show: docker-desktop

# Verify Kubernetes is running
kubectl get nodes
# Should show: docker-desktop   Ready   control-plane

# Verify Helm is installed
helm version
# Should show version info
```

## 🚀 Quick Start

### 1. Create Project Directory
```bash
mkdir medplum-k8s-deployment
cd medplum-k8s-deployment
```

### 2. Clone Medplum Repository
```bash
git clone https://github.com/medplum/medplum.git
cd medplum/charts
```

### 3. Deploy Medplum

```bash
# Deploy everything
./deploy.sh
```

The script will:
1. Create the `medplum` namespace
2. Deploy PostgreSQL and Redis
3. Wait for databases to be ready
4. Deploy the Medplum server
5. Wait for everything to be healthy

### 4. Verify Deployment

```bash
# Check deployment status
./status.sh

# Test the API directly
curl http://localhost:8103/healthcheck
```

## 🌐 Accessing Medplum

Once deployed, Medplum is accessible at:

| URL | Purpose |
|-----|---------|
| http://localhost:8103 | Main Medplum server |
| http://localhost:8103/healthcheck | Health check endpoint |
| http://localhost:8103/fhir/R4/metadata | FHIR capability statement |
| http://localhost:8103/fhir/R4/ | FHIR API base URL |

## 🔧 Management Commands

| Command | Purpose |
|---------|---------|
| `./deploy.sh` | Deploy Medplum |
| `./status.sh` | Check deployment status |
| `./cleanup.sh` | Remove everything |

### Kubernetes Commands

```bash
# View all resources
kubectl get all -n medplum

# View logs
kubectl logs -n medplum deployment/medplum
kubectl logs -n medplum deployment/postgres
kubectl logs -n medplum deployment/redis

# Restart a deployment
kubectl rollout restart deployment/medplum -n medplum

# Scale deployments
kubectl scale deployment medplum --replicas=2 -n medplum
```

## 🧪 Testing Your Deployment

### Health Check
```bash
curl http://localhost:8103/healthcheck
```

Expected response:
```json
{
  "ok": true,
  "version": "4.2.0",
  "postgres": true,
  "redis": true
}
```

### FHIR API Test
```bash
# Get FHIR capability statement
curl http://localhost:8103/fhir/R4/metadata

## 🔧 Troubleshooting

### Common Issues

**Pods not starting:**
```bash
# Check pod status
kubectl get pods -n medplum

# View pod details
kubectl describe pod <pod-name> -n medplum

# Check logs
kubectl logs -n medplum deployment/medplum
```

**Database connection issues:**
```bash
# Test database connectivity
kubectl exec -n medplum deployment/postgres -- psql -U medplum -d medplum -c "SELECT 1;"

# Test Redis connectivity
kubectl exec -n medplum deployment/redis -- redis-cli -a medplum ping
```

**Service not accessible:**
```bash
# Check service status
kubectl get services -n medplum

# Port forward as fallback
kubectl port-forward -n medplum service/medplum-service 8103:8103
```

### Reset Everything

If something goes wrong:
```bash
# Clean up completely
./cleanup.sh

# Wait a moment
sleep 10

# Deploy fresh
./deploy.sh
```

## 📊 Resource Usage

This deployment uses:
- **CPU**: ~1-2 cores
- **Memory**: ~2-4 GB RAM
- **Storage**: ~1-2 GB (temporary storage only)
- **Ports**: 8103 (Medplum), 5432 (PostgreSQL), 6379 (Redis)

## 🚨 Important Notes

### Security
- This configuration is for **development only**
- Uses demo/weak passwords and keys
- Allows all origins (`*`)
- **Do not use in production**

### Data Persistence
- Uses `emptyDir` volumes (data lost on pod restart)
- For persistent data, configure persistent volumes
- Database data will be reset on PostgreSQL pod restart

### Performance
- Single replica deployments
- No resource limits set
- Suitable for development and testing

## 🔄 Updates and Maintenance

### Updating Medplum
```bash
# Pull latest chart
cd medplum/charts
git pull

# Upgrade deployment
helm upgrade medplum . -n medplum -f values-local.yaml
```

### Viewing Logs
```bash
# Real-time Medplum logs
kubectl logs -f -n medplum deployment/medplum

# Database logs
kubectl logs -f -n medplum deployment/postgres

# All pod logs
kubectl logs -f -n medplum --all-containers=true
```

## 🎯 Next Steps

Once you have Medplum running:

1. **Explore the FHIR API** at http://localhost:8103/fhir/R4/
2. **Read the Medplum documentation** at https://www.medplum.com/docs
3. **Try the React components** for building healthcare UIs
4. **Set up authentication** for your applications
5. **Configure proper persistence** for production use

## 📚 Additional Resources

- [Medplum Documentation](https://www.medplum.com/docs)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Docker Desktop Kubernetes](https://docs.docker.com/desktop/kubernetes/)


**Happy coding with Medplum! 🏥✨**
