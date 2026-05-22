# EKS scaffold (placeholder)

Intentionally empty in v0. The plan:

- New CDK constructs under `@medplum/agent-harness/cdk` that pair each Agent
  pod with an HL7 peer pod (source and/or sink) on the same node.
- A `HarnessCluster` construct that takes a `ScenarioSpec` and renders the
  k8s manifests + EKS resources.
- Rolling-restart hook on the medplum/server Deployment so the harness's
  `simulate-server-upgrade` command can map to a real kubectl rollout.

Don't build this yet — get the local-process path solid first.
