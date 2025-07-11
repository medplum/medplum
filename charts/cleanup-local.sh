#!/bin/bash
set -e

echo "🧹 Cleaning up complete Medplum deployment..."

# Uninstall Helm release
echo "📦 Removing Helm release..."
helm uninstall medplum -n medplum 2>/dev/null || echo "No Helm release found"

# Delete Medplum app
echo "🖥️ Removing Medplum app..."
kubectl delete -f medplum-app.yaml 2>/dev/null || echo "No Medplum app found"

# Delete databases
echo "🗄️ Removing databases..."
kubectl delete -f databases.yaml 2>/dev/null || echo "No database resources found"

# Delete namespace (this removes everything else)
echo "🗑️ Removing namespace..."
kubectl delete namespace medplum 2>/dev/null || echo "No namespace found"

echo "✅ Complete cleanup finished!"
