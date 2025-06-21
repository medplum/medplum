# medplum-fission-test

## Fission Router Configuration

To interact with Fission functions from your application, you need to correctly configure the Fission Router's address. The `routerHost` and `routerPort` settings in your `FissionConfig` determine how your application connects to the Fission Router.

These settings specify the network address (hostname or IP address) and port through which the Fission Router can be reached.

- For applications running outside the Kubernetes cluster (e.g., local development machine, external client):
  - `routerHost`: This should be the IP address of a Kubernetes Node, or `localhost` / `127.0.0.1` if you are using a local Kubernetes setup like Docker Desktop.
  - `routerPort`: This must be the `NodePort` exposed by the Fission Router service. You can find this by running `kubectl get svc -n fission router`. In common Fission installations, this is often `31314`.
- For applications running inside the Kubernetes cluster (e.g., another service in the same cluster):
  - `routerHost`: This should be the internal ClusterIP service name of the Fission Router. Kubernetes DNS will resolve this name within the cluster. The standard format is `router.fission.svc.cluster.local`.
  - `routerPort`: This will typically be the standard HTTP port `80`, as the internal ClusterIP service usually exposes the router on its default HTTP port.

## Setup local dev

https://fission.io/docs/installation/

```bash
export FISSION_NAMESPACE="fission"
kubectl create namespace $FISSION_NAMESPACE
kubectl create -k "github.com/fission/fission/crds/v1?ref=v1.21.0"
helm repo add fission-charts https://fission.github.io/fission-charts/
helm repo update
helm install --version v1.21.0 --namespace $FISSION_NAMESPACE fission \
  --set serviceType=NodePort,routerServiceType=NodePort \
  fission-charts/fission-all
```

## Working with Dependencies

https://fission.io/docs/usage/languages/nodejs/#working-with-dependencies

First, create an environment with runtime image and builder image as follows:

```bash
fission environment create --name nodejs --image ghcr.io/fission/node-env --builder ghcr.io/fission/node-builder
```

Next, create a file momentExample.js with the following content.

```javascript
const momentpackage = require('moment');

module.exports = async function (context) {
  return {
    status: 200,
    body: momentpackage().format(),
  };
};
```

Sample `package.json`:

```json
{
  "name": "fission-nodejs-runtime",
  "engines": {
    "node": ">=7.6.0"
  },
  "dependencies": {
    "moment": "*"
  }
}
```

Next, create a zip archive of these 2 files:

```bash
zip node-source-example.zip momentExample.js package.json
```

Now create a fission source package with the zip file just created. This command outputs the name of the package created.

```bash
fission package create --src node-source-example.zip --env nodejs
```

Next, create a fission function with the package created above, let's assume the package name is `medplum-example-zip-h3ns`:

```bash
fission function create --name medplum-example --pkg medplum-example-zip-h3ns --env nodejs --entrypoint "index"
```

Check the build status with the following command.

```bash
fission package info --name medplum-example-zip-h3ns
```

Next, test your function with the following and the output should have the current time.

```bash
fission fn test --name medplum-example
```

## Troubleshooting

List Fission functions:

```bash
kubectl get functions
```

Show a Fission function definition as JSON:

```bash
kubectl get function <function-name> -o json
```

Show all Fission pods:

```bash
kubectl get pods -n fission
```

Tail builder logs:

```bash
kubectl logs -f -n fission $(kubectl get pods -n fission -l fission.io/function=builder -o jsonpath='{.items[0].metadata.name}')

kubectl get pods -n default -o jsonpath='{.items[0].metadata.name}'
```

Or, if you know the name of the builder pod:

```bash
kubectl logs -f -n fission buildermgr-786556886-8qm5v
```

If a pod crashes, you can check the logs of the previous instance:

```bash
kubectl logs -n fission buildermgr-786556886-8qm5v --previous
```

Delete all Fission HttpTriggers:

```bash
kubectl delete httptriggers --all -n default
```

Delete all Fission Functions:

```bash
kubectl delete functions --all -n default
```

Delete all Fission Packages:

```bash
kubectl delete packages --all -n default
```

Delete all Fission resources:

```bash
kubectl delete httptriggers --all -n default
kubectl delete functions --all -n default
kubectl delete packages --all -n default
```
