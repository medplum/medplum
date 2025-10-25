#!/bin/bash
echo "📊 Medplum Deployment Status"
echo "=========================="

# Check if namespace exists
if kubectl get namespace medplum &>/dev/null; then
    echo "✅ Namespace: medplum exists"

    # Check pods
    echo ""
    echo "🔄 Pods:"
    kubectl get pods -n medplum

    # Check services
    echo ""
    echo "🌐 Services:"
    kubectl get services -n medplum

    # Check if Medplum is responding
    echo ""
    echo "🏥 Health Check:"
    if kubectl exec -n medplum deployment/medplum -- node -e "fetch('http://localhost:8103/healthcheck').then(r => r.json()).then(console.log).catch(console.error)" 2>/dev/null; then
        echo "✅ Medplum is healthy!"
        echo "🌐 Access at: http://localhost:8103"
    else
        echo "❌ Medplum health check failed"
    fi
else
    echo "❌ Namespace 'medplum' not found. Run ./deploy-local.sh to deploy."
fi

echo ""
echo "⚡ Fission Status"
echo "================"

# Check if Fission namespace exists
if kubectl get namespace fission &>/dev/null; then
    echo "✅ Fission namespace exists"

    # Check Fission pods
    echo ""
    echo "🔄 Fission Pods:"
    kubectl get pods -n fission

    # Get router ClusterIP
    echo ""
    ROUTER_CLUSTER_IP=$(kubectl get svc router -n fission -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
    if [ -n "$ROUTER_CLUSTER_IP" ]; then
        echo "🌐 Router: $ROUTER_CLUSTER_IP:80 (internal)"
    else
        echo "❌ Router ClusterIP not found"
    fi
else
    echo "❌ Fission not found. Run ./deploy-local.sh to deploy."
fi
