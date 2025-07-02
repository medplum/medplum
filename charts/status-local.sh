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
    echo "❌ Namespace 'medplum' not found. Run ./deploy.sh to deploy."
fi

