# Medplum Kubernetes Local Deployment

A complete guide to deploy Medplum with Fission on Docker Desktop Kubernetes for local development.

## 🎯 Overview

This guide provides a simple, step-by-step process to deploy the Medplum healthcare platform with Fission serverless functions on your local machine using Docker Desktop's built-in Kubernetes cluster.

**What you'll get:**

- 🏥 Medplum FHIR server running on http://localhost:8103
- 🖥️ Medplum web app running on http://localhost:3000
- 🗄️ PostgreSQL database for data storage
- ⚡ Redis cache for performance
- 🔧 Fission serverless framework for running Medplum Bots
- 🔐 Pre-configured RBAC permissions for Fission integration
- 🧹 Easy cleanup and redeployment

## 📋 Prerequisites

Before starting, ensure you have:

### Required Software

- **Docker Desktop** https://docs.docker.com/desktop/
- **kubectl** https://kubernetes.io/docs/tasks/tools/
- **Helm** https://helm.sh/docs/intro/install/
- **Fission CLI** https://fission.io/docs/installation/

### Docker Desktop Configuration

1. Open Docker Desktop
2. Go to **Settings** → **Resources**
3. Allocate at least **8GB RAM** and **4 CPUs** (Fission requires more resources)
4. Go to **Settings** → **Kubernetes**
5. Check **"Enable Kubernetes"**
6. Click **"Apply & Restart"**
7. Wait for Kubernetes to start (green indicator)

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

# Verify Fission CLI is installed
fission version
# Should show version info
```

## 🚀 Quick Start

### 1. Create Project Directory

```bash
mkdir medplum-k8s-deployment
cd medplum-k8s-deployment
```

### 2. Deploy Medplum with Fission

```bash
# Deploy everything (including Fission)
./deploy-local.sh
```

The script will:

1. Create the `medplum` namespace
2. Install Fission v1.21.0 with proper CRDs
3. Set up RBAC permissions for Medplum-Fission integration
4. Deploy PostgreSQL and Redis
5. Wait for databases to be ready
6. Deploy the Medplum server
7. Deploy the Medplum web app
8. Create a default Node.js environment in Fission
9. Provide configuration details for Medplum

### 3. Verify Deployment

```bash
# Check deployment status
./status-local.sh

# Test the API directly
curl http://localhost:8103/healthcheck
```

## 🌐 Accessing Medplum

Once deployed, Medplum is accessible at:

| URL                                    | Purpose                   |
| -------------------------------------- | ------------------------- |
| http://localhost:3000                  | Medplum web application   |
| http://localhost:8103                  | Main Medplum server       |
| http://localhost:8103/healthcheck      | Health check endpoint     |
| http://localhost:8103/fhir/R4/metadata | FHIR capability statement |
| http://localhost:8103/fhir/R4/         | FHIR API base URL         |

## ⚡ Fission Integration

### What is Fission?

Fission is a Kubernetes-native serverless framework that enables you to run Medplum Bots as serverless functions. This allows for:

- Automatic scaling based on demand
- Efficient resource usage
- Easy deployment and management of bot functions
- Integration with Kubernetes ecosystem

### Working with Fission

```bash
# List available environments
fission env list

# List deployed functions
fission fn list
```

## 🔧 Management Commands

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `./deploy-local.sh`  | Deploy Medplum with Fission                     |
| `./status-local.sh`  | Check deployment status                         |
| `./cleanup-local.sh` | Remove everything (with option to keep Fission) |

### Kubernetes Commands

```bash
# View all Medplum resources
kubectl get all -n medplum

# View all Fission resources
kubectl get all -n fission

# View logs
kubectl logs -n medplum deployment/medplum
kubectl logs -n medplum deployment/postgres
kubectl logs -n medplum deployment/redis
kubectl logs -n fission deployment/executor

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
```

### Fission Test

```bash
# Test Fission is working
fission env list
# Should show: nodejs environment

# Test RBAC permissions
kubectl auth can-i create packages.fission.io --as=system:serviceaccount:medplum:medplum -n default
# Should show: yes
```

## 🔧 Troubleshooting

### Common Issues

**Pods not starting:**

```bash
# Check pod status
kubectl get pods -n medplum
kubectl get pods -n fission

# View pod details
kubectl describe pod <pod-name> -n medplum

# Check logs
kubectl logs -n medplum deployment/medplum
kubectl logs -n fission deployment/executor
```

**Fission issues:**

```bash
# Run the debug script
./debug-fission.sh

# Check Fission router
kubectl get svc -n fission router

# Test Fission CLI connection
fission env list
```

**Database connection issues:**

```bash
# Test database connectivity
kubectl exec -n medplum deployment/postgres -- psql -U medplum -d medplum -c "SELECT 1;"

# Test Redis connectivity
kubectl exec -n medplum deployment/redis -- redis-cli -a medplum ping
```

### Reset Everything

If something goes wrong:

```bash
# Clean up completely (including Fission)
./cleanup-local.sh
# Answer 'y' when prompted about Fission removal

# Wait a moment
sleep 10

# Deploy fresh
./deploy-local.sh
```

## 📊 Resource Usage

This deployment uses:

- **CPU**: ~2-3 cores (increased due to Fission)
- **Memory**: ~4-6 GB RAM (increased due to Fission)
- **Storage**: ~2-3 GB (temporary storage only)
- **Ports**: 3000 (Medplum App), 8103 (Medplum Server), 5432 (PostgreSQL), 6379 (Redis)

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
- No resource limits set by default
- Suitable for development and testing
- Fission may take additional time to start functions on first use

### Fission Considerations

- Functions are deployed in the `default` namespace
- Uses Node.js runtime environment
- Built-in builder for handling dependencies
- Functions scale to zero when not in use

## 🔄 Updates and Maintenance

### Updating Medplum

```bash
# Pull latest chart
helm repo update

# Upgrade deployment
helm upgrade medplum . -n medplum -f values-local.yaml
```

### Updating Fission

```bash
# Check current version
helm list -n fission

# Upgrade Fission (be careful with version compatibility)
helm upgrade fission fission-charts/fission-all -n fission
```

### Viewing Logs

```bash
# Real-time Medplum logs
kubectl logs -f -n medplum deployment/medplum

# Database logs
kubectl logs -f -n medplum deployment/postgres

# Fission logs
kubectl logs -f -n fission deployment/executor
kubectl logs -f -n fission deployment/router
```

## 🎯 Next Steps

Once you have Medplum with Fission running:

1. **Explore the FHIR API** at http://localhost:8103/fhir/R4/
2. **Try the web app** at http://localhost:3000
3. **Create your first Bot** using the Medplum web interface
4. **Deploy Bots to Fission** for serverless execution
5. **Read the Medplum documentation** at https://www.medplum.com/docs
6. **Learn about Fission** at https://fission.io/docs/
7. **Set up authentication** for your applications
8. **Configure proper persistence** for production use

## 📚 Additional Resources

- [Medplum Documentation](https://www.medplum.com/docs)
- [Medplum Bot Development](https://www.medplum.com/docs/bots)
- [Fission Documentation](https://fission.io/docs/)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Docker Desktop Kubernetes](https://docs.docker.com/desktop/kubernetes/)

**Happy coding with Medplum! 🏥⚡✨**
