#!/bin/bash
set -e

echo "🚀 Deploying Complete Medplum Stack to Kubernetes..."

# Check DNS is working first
echo "🔍 Checking DNS..."
if ! kubectl get services -n kube-system | grep -q dns; then
    echo "❌ DNS not found. Please restart Docker Desktop and re-enable Kubernetes."
    exit 1
fi

# Step 1: Create namespace
echo "📦 Creating namespace..."
kubectl create namespace medplum --dry-run=client -o yaml | kubectl apply -f -

# Step 2: Deploy databases
echo "🗄️ Deploying PostgreSQL and Redis..."
kubectl apply -f databases-local.yaml

# Step 3: Wait for databases to be ready
echo "⏳ Waiting for databases to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/postgres -n medplum
kubectl wait --for=condition=available --timeout=300s deployment/redis -n medplum

# Step 4: Test DNS resolution (robust version)
echo "🔍 Testing DNS resolution..."
DNS_TEST_RESULT=$(kubectl run dns-test --image=busybox --rm -i --restart=Never -n medplum --timeout=30s -- sh -c "nslookup postgres 2>&1" || true)

if echo "$DNS_TEST_RESULT" | grep -q "Address:"; then
    echo "✅ DNS is working!"
else
    echo "⚠️ DNS test failed, but continuing deployment..."
    echo "   (This is often normal - services should still resolve each other)"
fi

# Step 5: Deploy Medplum server
echo "🏥 Deploying Medplum server..."
helm install medplum . -n medplum -f values-local.yaml

# Step 6: Wait for Medplum server to be ready
echo "⏳ Waiting for Medplum server to be ready..."
kubectl wait --for=condition=available --timeout=600s deployment/medplum -n medplum

# Step 7: Deploy Medplum app
echo "🖥️ Deploying Medplum app..."
kubectl apply -f medplum-app-local.yaml

# Step 8: Wait for Medplum app to be ready
echo "⏳ Waiting for Medplum app to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/medplum-app -n medplum

echo "✅ Complete Medplum stack deployed!"
echo ""
echo "🌐 Access Points:"
echo "  • Medplum App (UI):    http://localhost:3000"
echo "  • Medplum Server:      http://localhost:8103"
echo "  • Health Check:        http://localhost:8103/healthcheck"
echo "  • FHIR API:            http://localhost:8103/fhir/R4/metadata"
echo ""
echo "📊 Check status with: ./status-local.sh"
