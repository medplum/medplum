# This file is used to deploy cert-manager using Helm in the Azure Kubernetes Service (AKS) cluster.

data "azurerm_kubernetes_cluster" "server_cluster" {
  name                = azurerm_kubernetes_cluster.server_cluster.name
  resource_group_name = azurerm_kubernetes_cluster.server_cluster.resource_group_name
}

// Use the cluster's kube_config to configure the Helm (or Kubernetes) provider.
provider "helm" {
  kubernetes {
    host                   = data.azurerm_kubernetes_cluster.server_cluster.kube_config.0.host
    client_certificate     = base64decode(data.azurerm_kubernetes_cluster.server_cluster.kube_config.0.client_certificate)
    client_key             = base64decode(data.azurerm_kubernetes_cluster.server_cluster.kube_config.0.client_key)
    cluster_ca_certificate = base64decode(data.azurerm_kubernetes_cluster.server_cluster.kube_config.0.cluster_ca_certificate)
  }
}

resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true

  set {
    name  = "installCRDs"
    value = "true"
  }
}
