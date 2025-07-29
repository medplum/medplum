#!/bin/bash
set -e

echo "🧹 Cleaning up complete Medplum deployment with Fission..."

# Step 1: Clean up Fission functions and packages (if any)
echo "⚡ Cleaning up Fission functions and packages..."
if command -v fission >/dev/null 2>&1; then
    echo "   Removing Fission functions..."
    fission fn list --namespace medplum 2>/dev/null | grep -v NAME | awk '{print $1}' | while read -r fn; do
        [ -n "$fn" ] && fission fn delete --name "$fn" --namespace medplum 2>/dev/null || true
    done

    echo "   Removing Fission packages..."
    fission pkg list --namespace medplum 2>/dev/null | grep -v NAME | awk '{print $1}' | while read -r pkg; do
        [ -n "$pkg" ] && fission pkg delete --name "$pkg" --namespace medplum 2>/dev/null || true
    done

    echo "   Removing Fission environments..."
    fission env list --namespace medplum 2>/dev/null | grep -v NAME | awk '{print $1}' | while read -r env; do
        [ -n "$env" ] && fission env delete --name "$env" --namespace medplum 2>/dev/null || true
    done

    echo "   Removing Fission triggers..."
    fission httptrigger list --namespace medplum 2>/dev/null | grep -v NAME | awk '{print $1}' | while read -r trigger; do
        [ -n "$trigger" ] && fission httptrigger delete --name "$trigger" --namespace medplum 2>/dev/null || true
    done
else
    echo "   ⚠️ Fission CLI not found, skipping function cleanup"
fi

# Step 2: Uninstall Helm release
echo "📦 Removing Helm release..."
helm uninstall medplum -n medplum 2>/dev/null || echo "No Medplum Helm release found"

# Step 3: Delete Medplum app
echo "🖥️ Removing Medplum app..."
kubectl delete -f medplum-app-local.yaml 2>/dev/null || echo "No Medplum app found"

# Step 4: Delete databases
echo "🗄️ Removing databases..."
kubectl delete -f databases-local.yaml 2>/dev/null || echo "No database resources found"

# Step 5: Clean up Fission RBAC permissions
echo "🔐 Removing Fission RBAC permissions..."
kubectl delete -f fission-rbac.yaml 2>/dev/null || echo "No Fission RBAC resources found"

# Step 6: Delete Medplum namespace
echo "🗑️ Removing Medplum namespace..."
kubectl delete namespace medplum 2>/dev/null || echo "No Medplum namespace found"

# Step 7: Ask about Fission cleanup
echo ""
read -p "🤔 Do you want to completely remove Fission? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "⚡ Removing Fission completely..."

    # Remove Fission Helm releases from all possible namespaces
    echo "   Removing Fission Helm releases..."
    helm uninstall fission -n fission 2>/dev/null || echo "   No Fission Helm release in fission"
    helm uninstall fission -n fission-system 2>/dev/null || echo "   No Fission Helm release in fission-system"
    helm uninstall fission -n default 2>/dev/null || echo "   No Fission Helm release in default"

    # Force delete problematic resources
    echo "   Removing problematic Fission resources..."
    kubectl delete serviceaccount fission-fetcher -n default 2>/dev/null || echo "   No fission-fetcher ServiceAccount in default"
    kubectl delete serviceaccount fission-fetcher -n fission-system 2>/dev/null || echo "   No fission-fetcher ServiceAccount in fission-system"

    # Delete all Fission-related resources in default namespace
    echo "   Cleaning up Fission resources in default namespace..."
    kubectl get all -n default -o name | grep fission | while read -r resource; do
        [ -n "$resource" ] && kubectl delete "$resource" -n default 2>/dev/null || true
    done

    # Delete Fission namespaces
    echo "   Removing Fission namespaces..."
    kubectl delete namespace fission 2>/dev/null || echo "   No fission namespace found"
    kubectl delete namespace fission-system 2>/dev/null || echo "   No fission-system namespace found"
    kubectl delete namespace fission-function 2>/dev/null || echo "   No fission-function namespace found"
    kubectl delete namespace fission-builder 2>/dev/null || echo "   No fission-builder namespace found"

    # Clean up Fission CRDs
    echo "   Removing Fission CRDs..."
    kubectl get crd | grep fission.io | awk '{print $1}' | while read -r crd; do
        [ -n "$crd" ] && kubectl delete crd "$crd" 2>/dev/null || true
    done

    # Clean up any remaining Fission cluster roles
    echo "   Removing Fission cluster roles..."
    kubectl get clusterrole | grep fission | awk '{print $1}' | while read -r role; do
        [ -n "$role" ] && kubectl delete clusterrole "$role" 2>/dev/null || true
    done

    # Clean up any remaining Fission cluster role bindings
    echo "   Removing Fission cluster role bindings..."
    kubectl get clusterrolebinding | grep fission | awk '{print $1}' | while read -r binding; do
        [ -n "$binding" ] && kubectl delete clusterrolebinding "$binding" 2>/dev/null || true
    done

    # Clean up any remaining Fission service accounts
    echo "   Removing Fission service accounts..."
    kubectl get serviceaccount --all-namespaces | grep fission | while read -r ns sa rest; do
        [ -n "$sa" ] && kubectl delete serviceaccount "$sa" -n "$ns" 2>/dev/null || true
    done

    # Remove Fission Helm repo (optional)
    echo "   Removing Fission Helm repository..."
    helm repo remove fission-charts 2>/dev/null || echo "   Fission Helm repo not found"

    echo "   ✅ Fission completely removed!"
else
    echo "   ⚡ Fission installation kept (you can use it for other projects)"
fi

echo ""
echo "✅ Complete cleanup finished!"
echo ""
echo "🔍 Verification Commands:"
echo "  • Medplum namespace:     kubectl get namespace medplum"
echo "  • Fission status:        kubectl get namespace fission-system"
echo "  • All Medplum resources: kubectl get all -n medplum"
echo "  • Fission functions:     fission fn list"
echo "  • Cluster roles:         kubectl get clusterrole | grep fission"
