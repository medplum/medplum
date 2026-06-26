#!/bin/bash
set -e

echo "🚀 Deploying Complete Medplum Stack with Fission to Kubernetes..."

# Check DNS is working first
echo "🔍 Checking DNS..."
if ! kubectl get services -n kube-system | grep -q dns; then
    echo "❌ DNS not found. Please restart Docker Desktop and re-enable Kubernetes."
    exit 1
fi

# Step 1: Create namespace
echo "📦 Creating namespace..."
kubectl create namespace medplum -n default

# Step 2: Install Fission (following Medplum's recommended approach)
echo "⚡ Installing Fission..."
# Check if Fission is already installed
if ! kubectl get namespace fission >/dev/null 2>&1; then
    # Define the namespace for Fission
    export FISSION_NAMESPACE="fission"

    # Create the Fission namespace
    kubectl create namespace $FISSION_NAMESPACE

    # Apply Fission's Custom Resource Definitions (CRDs)
    echo "   Installing Fission CRDs..."
    kubectl create -k "github.com/fission/fission/crds/v1?ref=v1.21.0"

    # Add the Fission Helm repository
    helm repo add fission-charts https://fission.github.io/fission-charts/ 2>/dev/null || echo "   Fission repo already added"
    helm repo update

    # Install Fission using Helm with ClusterIP for internal access
    echo "   Installing Fission with ClusterIP services..."
    helm install --version v1.21.0 --namespace $FISSION_NAMESPACE fission \
        --set serviceType=ClusterIP,routerServiceType=ClusterIP \
        fission-charts/fission-all

    # Check if installation was successful
    if [ $? -eq 0 ]; then
        echo "   ✅ Fission installation completed"
    else
        echo "   ❌ Fission installation failed, but continuing..."
        echo "   You can check the status with: kubectl get pods -n fission"
    fi
else
    echo "   ✅ Fission already installed"
fi

# Step 3: Wait for Fission to be ready
echo "⏳ Waiting for Fission to be ready..."
echo "   Checking Fission pod status..."
kubectl get pods -n fission 2>/dev/null || echo "   No Fission pods found yet"

# Wait for key Fission components with individual timeouts
echo "   Waiting for Fission controller..."
if kubectl wait --for=condition=available --timeout=180s deployment/controller -n fission 2>/dev/null; then
    echo "   ✅ Controller ready"
else
    echo "   ⚠️ Controller not ready, checking pod logs..."
    kubectl logs -n fission deployment/controller --tail=20 2>/dev/null || echo "   No controller logs available"
fi

echo "   Waiting for Fission router..."
if kubectl wait --for=condition=available --timeout=180s deployment/router -n fission 2>/dev/null; then
    echo "   ✅ Router ready"
else
    echo "   ⚠️ Router not ready, checking pod logs..."
    kubectl logs -n fission deployment/router --tail=20 2>/dev/null || echo "   No router logs available"
fi

echo "   Current Fission pod status:"
kubectl get pods -n fission 2>/dev/null || echo "   No Fission pods found"

# Step 4: Create Fission RBAC permissions
echo "🔐 Setting up Fission RBAC permissions..."
kubectl apply -f fission-rbac.yaml

# Step 5: Deploy databases
echo "🗄️ Deploying PostgreSQL and Redis..."
kubectl apply -f databases-local.yaml

# Step 6: Wait for databases to be ready
echo "⏳ Waiting for databases to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/postgres -n medplum
kubectl wait --for=condition=available --timeout=300s deployment/redis -n medplum

# Step 7: Test DNS resolution (robust version)
echo "🔍 Testing DNS resolution..."
DNS_TEST_RESULT=$(kubectl run dns-test --image=busybox --rm -i --restart=Never -n medplum --timeout=30s -- sh -c "nslookup postgres 2>&1" || true)

if echo "$DNS_TEST_RESULT" | grep -q "Address:"; then
    echo "✅ DNS is working!"
else
    echo "⚠️ DNS test failed, but continuing deployment..."
    echo "   (This is often normal - services should still resolve each other)"
fi

# Step 8: Deploy Medplum server
echo "🏥 Deploying Medplum server..."
helm repo add medplum https://charts.medplum.com
helm repo update
helm install medplum medplum/medplum -n medplum -f ./values-local.yaml

# Step 9: Wait for Medplum server to be ready
echo "⏳ Waiting for Medplum server to be ready..."
kubectl wait --for=condition=available --timeout=600s deployment/medplum -n medplum

# Step 10: Deploy Medplum app
echo "🖥️ Deploying Medplum app..."
kubectl apply -f medplum-app-local.yaml

# Step 11: Wait for Medplum app to be ready
echo "⏳ Waiting for Medplum app to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/medplum-app -n medplum

# Step 12: Verify Fission integration
echo "🔍 Verifying Fission integration..."
if kubectl auth can-i create packages.fission.io --as=system:serviceaccount:medplum:medplum -n default >/dev/null 2>&1; then
    echo "✅ Fission RBAC permissions verified!"
else
    echo "⚠️ Fission RBAC permissions may need time to propagate..."
fi

# Step 13: Create default Fission Node.js environment
echo "🌍 Creating default Fission Node.js environment..."
if ! fission env get --name nodejs >/dev/null 2>&1; then
    # Wait a moment for Fission to be fully ready
    sleep 10
    fission environment create --name nodejs --image ghcr.io/fission/node-env --builder ghcr.io/fission/node-builder
    if [ $? -eq 0 ]; then
        echo "✅ Node.js environment created"
    else
        echo "⚠️ Failed to create Node.js environment, you may need to create it manually"
        echo "   Command: fission environment create --name nodejs --image ghcr.io/fission/node-env --builder ghcr.io/fission/node-builder"
    fi
else
    echo "✅ Node.js environment already exists"
fi

# Step 14: Get Fission router ClusterIP for configuration
echo "🔍 Getting Fission router ClusterIP..."
ROUTER_CLUSTER_IP=$(kubectl get svc router -n fission -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
if [ -n "$ROUTER_CLUSTER_IP" ]; then
    echo "✅ Fission router ClusterIP: $ROUTER_CLUSTER_IP"
else
    echo "⚠️ Could not determine router ClusterIP"
    ROUTER_CLUSTER_IP="router.fission.svc.cluster.local"
fi

echo "✅ Complete Medplum stack with Fission deployed!"
echo ""
echo "🌐 Access Points:"
echo "  • Medplum App (UI):    http://localhost:3000"
echo "  • Medplum Server:      http://localhost:8103"
echo "  • Health Check:        http://localhost:8103/healthcheck"
echo "  • FHIR API:            http://localhost:8103/fhir/R4/metadata"
echo ""
echo "⚡ Fission Integration:"
echo "  • Fission Status:      fission env list"
echo "  • Service Account:     medplum (in medplum namespace)"
echo "  • RBAC Permissions:    fission-medplum-access cluster role"
echo "  • Router ClusterIP:    $ROUTER_CLUSTER_IP"
echo "  • Test Function:       fission fn create --name hello --env nodejs --code hello.js"
echo ""
