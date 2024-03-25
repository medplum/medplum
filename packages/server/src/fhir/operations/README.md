# FHIR Operations

This folder contains implementations of [FHIR Operations](https://hl7.org/fhir/operations.html)

See [this list of defined operations](https://hl7.org/fhir/operationslist.html)

## Implementing an Operation

All Operations supported by the server should have a corresponding [`OperationDefinition`][op-def] resource that
specifies important details including:

- Typed input and output parameters
- Which REST routes the Operation is available on
- If the Operation is idempotent

Utility functions that use the `OperationDefinition` to automate implementation details are available:

- [`parseInputParameters`](./utils/parameters.ts) takes either standard `Parameters` input or plain JSON key-value pairs
  for compatibility, and produces an object containing all defined input parameter values
  - Validates number of parameter values, including required parameters
- [`buildOutputParameters`](./utils/parameters.ts) handles sending a set of output values as the response
  - Only sends parameters defined in the `OperationDefinition`
  - Validates parameter cardinality and throws a server error when response wouldn't match `OperationDefinition`
  - Can be passed a `Resource` when there is one matching output parameter named `return`

### Example: Project $init

```ts
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { created } from '@medplum/core';
import { Reference, OperationDefinition } from '@medplum/fhirtypes';
import { Request, Response } from 'express';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'project-init',
  status: 'active',
  kind: 'operation',
  code: 'init',
  resource: ['Project'],
  system: false,
  type: true, // Available at route /Project/$init only
  instance: false,
  parameter: [
    // Required param: name (string)
    { use: 'in', name: 'name', type: 'string', min: 1, max: '1' },
    // Optional params: owner (Reference), ownerEmail (string)
    { use: 'in', name: 'owner', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'ownerEmail', type: 'string', min: 0, max: '1' },
    // Output parameter: Project
    { use: 'out', name: 'return', type: 'Project', min: 1, max: '1' },
  ],
};

interface ProjectInitParameters {
  name: string;
  owner?: Reference;
  ownerEmail?: string;
}

export async function projectInitHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ProjectInitParameters>(operation, req);

  // Handle operation business logic...
  const project = doProjectInit(params);

  // Special case: single `return` output parameter means respond with the Project resource directly
  return [created, project];
}
```
