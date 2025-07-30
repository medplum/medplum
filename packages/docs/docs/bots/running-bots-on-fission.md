# Running Bots on Fission

Medplum Bots provide powerful automation capabilities within your Medplum environment. While Medplum offers a built-in execution environment for bots, this page details how to deploy and manage your Medplum Bots using Fission, an open-source, Kubernetes-native serverless framework. This approach can be beneficial for organizations seeking advanced scalability, custom runtime environments, or deeper integration with existing Kubernetes infrastructure.

## What are Medplum Bots?

Medplum bots are JavaScript code snippets that automate workflows within Medplum by reacting to changes in healthcare data (FHIR resources) and performing operations like data validation, notifications, or integrations. They are a core component of building dynamic and responsive healthcare applications on Medplum.

## What is Fission?

Fission.io is an open-source, Kubernetes-native serverless framework that allows developers to deploy and run short-lived functions in any language, triggered by various events, without having to manage the underlying container infrastructure. It seamlessly integrates with Kubernetes, leveraging its orchestration capabilities for efficient function execution and scaling.

This guide focuses on setting up the necessary infrastructure to run Medplum Bots as Fission functions. It covers the configuration, deployment, and management of these serverless functions, enabling them to respond to events originating from your Medplum instance.

## Fission Router Configuration

To enable your Medplum application to communicate with your Fission functions, you must correctly configure the Fission Router's address. The `routerHost` and `routerPort` settings within your `FissionConfig` dictate how your application establishes a connection to the Fission Router.

These settings specify the network address (hostname or IP address) and the port through which the Fission Router can be accessed. The optimal configuration depends on where your Medplum application is deployed relative to your Fission cluster.

- **For applications running outside the Kubernetes cluster** (e.g., local development machine, external client):
  - `routerHost`: This should be the external IP address of a Kubernetes Node where Fission is running, or `localhost` / `127.0.0.1` if you are using a local Kubernetes setup like Docker Desktop.
  - `routerPort`: This must be the `NodePort` exposed by the Fission Router service. You can determine this by running `kubectl get svc -n fission router`. In many common Fission installations, this is often `31314`.

- **For applications running inside the Kubernetes cluster** (e.g., another service within the same cluster):
  - `routerHost`: This should be the internal ClusterIP service name of the Fission Router. Kubernetes DNS will automatically resolve this name within the cluster. The standard format is `router.fission.svc.cluster.local`.
  - `routerPort`: This will typically be the standard HTTP port `80`, as the internal ClusterIP service usually exposes the router on its default HTTP port.

## Medplum Server Configuration for Fission

Add your Fission router configuration to your Medplum server configuration.

For example, when running a local development setup with Fission in a Docker Desktop Kubernetes cluster, add the following to `medplum.config.json`:

```json
"fission": {
  "namespace": "default",
  "fieldManager": "medplum-fission-example",
  "environmentName": "nodejs",
  "routerHost": "localhost",
  "routerPort": 31314
}
```

When using AWS Parameter Store, you can add a single `fission` parameter with the following JSON value:

```json
{
  "namespace": "default",
  "fieldManager": "medplum-fission-example",
  "environmentName": "nodejs",
  "routerHost": "localhost",
  "routerPort": 31314
}
```

## Local Development Setup for Fission

To run a pre-configured Medplum + Fission environment, you can follow the instructions in https://github.com/medplum/medplum/tree/main/examples/medplum-local-k8s/readme-local.md

Otherwise, to get started with Fission for local development or testing, follow these steps to install it on your Kubernetes cluster. For detailed and up-to-date installation instructions, always refer to the official Fission documentation: [https://fission.io/docs/installation/](https://fission.io/docs/installation/)

```bash
# Define the namespace for Fission
export FISSION_NAMESPACE="fission"

# Create the Fission namespace
kubectl create namespace $FISSION_NAMESPACE

# Apply Fission's Custom Resource Definitions (CRDs)
# The `ref` parameter pins the version for stability and reproducibility.
# For production, always use a specific, tested version.
# Check Fission's official documentation for the latest stable release.
kubectl create -k "github.com/fission/fission/crds/v1?ref=v1.21.0"

# Add the Fission Helm repository
helm repo add fission-charts https://fission.github.io/fission-charts/

# Update your Helm repositories
helm repo update

# Install Fission using Helm
# The --set serviceType=NodePort,routerServiceType=NodePort is crucial for external access in development
helm install --version v1.21.0 --namespace $FISSION_NAMESPACE fission \
  --set serviceType=NodePort,routerServiceType=NodePort \
  fission-charts/fission-all
```

This setup will install Fission with NodePort services for its components, making it accessible from outside the cluster, which is ideal for local development and testing.

## Working with Dependencies in Fission Bots

Medplum Bots often rely on external npm packages. When running your bots on Fission, Medplum handles the packaging and deployment of your bot code along with its `package.json` file. This allows Fission to install the necessary dependencies during the build process.

Refer to the official Fission documentation for the most current information on managing dependencies: [https://fission.io/docs/usage/languages/nodejs/\#working-with-dependencies](https://fission.io/docs/usage/languages/nodejs/#working-with-dependencies)

Here's a general workflow for preparing your bot:

1.  **Create a Node.js Environment in Fission:**
    First, establish a Fission environment that includes the necessary runtime and builder images for Node.js. Medplum will use this environment to deploy and execute your Bot.

    ```bash
    fission environment create --name nodejs --image ghcr.io/fission/node-env --builder ghcr.io/fission/node-builder
    ```

2.  **Prepare your Medplum Bot Code:**
    Create your Medplum Bot's source file

    ```ts
    import { BotEvent, MedplumClient } from '@medplum/core';
    import { Patient } from '@medplum/fhirtypes';

    export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
      const patient = event.input as Patient;
      const firstName = patient.name?.[0]?.given?.[0];
      const lastName = patient.name?.[0]?.family;
      console.log(`Hello ${firstName} ${lastName}!`);
      return true;
    }
    ```

    See [Bot Basics - Editing a Bot](/docs/bots/bot-basics#editing-a-bot) for more details on writing Medplum Bot code.

3.  **Deploying your Bot with Medplum:**
    Unlike direct Fission deployment, **Medplum handles the packaging, Fission package creation, and Fission function creation automatically** when you deploy your bot. You simply define your bot code within Medplum, and Medplum's internal processes will manage the Fission-specific deployment steps.

    See [Bot Basics - Deploying a Bot](/docs/bots/bot-basics#deploying-a-bot) for more details on deploying your bot.

4.  **Check Fission Build Status (for debugging):**
    After deploying your bot through Medplum, you can still monitor the Fission build status of the underlying package to ensure all dependencies are correctly installed and the function is ready. You'll need to know the name of the Fission package created by Medplum (which typically incorporates your bot's ID).

    ```bash
    # You might need to inspect Medplum logs or Fission resources to find the exact package name.
    fission package info --name <medplum-generated-fission-package-name>
    ```

5.  **Test Your Fission Function (for debugging):**
    Once the package build is complete, you can test your Fission function directly. For Medplum Bots, you'd typically send a POST request with FHIR data to the bot's Fission endpoint.

    ```bash
    curl -X POST -H "Content-Type: application/json" \
      -d '{ "resourceType": "Patient", "id": "123", "name": [{ "given": ["John"], "family": "Doe" }] }' \
      "https://api.medplum.com/fhir/R4/Bot/<your-bot-id>/\$execute"
    ```

    See [Bot Basics - Executing a Bot](/docs/bots/bot-basics#executing-a-bot) for more details on executing your bot.

## Troubleshooting Fission Deployments

When working with Fission, especially during initial setup or debugging, these commands can be invaluable:

- **List Fission Functions:** See all deployed Fission functions in your cluster.

  ```bash
  kubectl get functions -n <your-fission-namespace>
  ```

- **Show a Fission Function Definition (JSON):** Get detailed configuration of a specific function.

  ```bash
  kubectl get function <function-name> -o json -n <your-fission-namespace>
  ```

- **Show All Fission Pods:** Identify the pods associated with Fission, including builders, executors, and routers.

  ```bash
  kubectl get pods -n fission
  ```

- **Tail Builder Logs:** Essential for debugging dependency installation or build issues. Replace `<builder-pod-name>` with the actual name.

  ```bash
  # Find builder pod name
  kubectl get pods -n fission -l fission.io/function=builder -o jsonpath='{.items[0].metadata.name}'

  # Tail logs
  kubectl logs -f -n fission $(kubectl get pods -n fission -l fission.io/function=builder -o jsonpath='{.items[0].metadata.name}')
  ```

  Or, if you know the name of a specific builder pod (e.g., `buildermgr-786556886-8qm5v`):

  ```bash
  kubectl logs -f -n fission buildermgr-786556886-8qm5v
  ```

- **View Previous Container Logs:** If a pod crashes and restarts, you can inspect the logs from its previous instance.

  ```bash
  kubectl logs -n fission <pod-name> --previous
  ```

- **Delete All Fission HTTP Triggers (in a specific namespace, usually `default` for functions):**

  ```bash
  kubectl delete httptriggers --all -n default
  ```

- **Delete All Fission Functions (in a specific namespace):**

  ```bash
  kubectl delete functions --all -n default
  ```

- **Delete All Fission Packages (in a specific namespace):**

  ```bash
  kubectl delete packages --all -n default
  ```

- **Delete All Fission Resources (HTTP Triggers, Functions, Packages in a specific namespace):**

  ```bash
  kubectl delete httptriggers --all -n default
  kubectl delete functions --all -n default
  kubectl delete packages --all -n default
  ```

  _Note: Always be careful when using `--all` and ensure you are in the correct namespace to avoid unintended deletions._
