# Custom FHIR Operations

Custom FHIR Operations is a powerful feature that allows you to extend the Medplum FHIR server with your own custom operations using the Medplum Bots framework. This feature enables you to create sophisticated business logic that integrates seamlessly with the FHIR API while leveraging the full power of JavaScript execution.

:::warning

Medplum Custom FHIR Operations are in beta. As this is a beta feature, please note:

- APIs may change based on feedback
- Performance characteristics are still being optimized
- Some edge cases may not be fully handled
- Documentation and tooling are evolving

:::

## What are Custom FHIR Operations?

Custom FHIR Operations combine two key Medplum features:

1. **FHIR Operations** - Standard FHIR operations (like `$validate`, `$expand`, etc.) that can be invoked via HTTP requests
2. **Medplum Bots** - JavaScript functions that can be executed server-side with access to the Medplum SDK

This integration allows you to:

- Define custom business logic using JavaScript
- Expose that logic as standard FHIR operations
- Maintain full FHIR compliance while extending functionality
- Process and transform FHIR resources programmatically
- Integrate with external systems and APIs

## How It Works

Custom operations are implemented through three main components:

1. **Bot** - Contains the JavaScript code that implements your custom logic
2. **OperationDefinition** - Defines the operation interface and links to your Bot
3. **Extension** - Links the `OperationDefinition` to the `Bot` implementation

When a client calls your custom operation (e.g., `POST /fhir/R4/Patient/$my-custom-operation`), Medplum:

1. Looks up the corresponding `OperationDefinition`
2. Finds the linked Bot via the extension
3. Executes the `Bot` with the operation input
4. Returns the `Bot`'s output as the operation result

## How to Use Custom FHIR Operations

### Step 1: Create a Bot

First, create a `Bot` that contains your custom logic:

```javascript
exports.handler = async function (medplum, event) {
  const patient = event.input;

  // Your custom logic here
  patient.identifier = patient.identifier || [];
  patient.identifier.push({
    system: 'https://example.com/patient-id',
    value: '12345',
  });

  return patient;
};
```

See [Bot Basics](/docs/bots/bot-basics) for more details on creating Bots.

**Important Requirements:**

- Your Medplum project must have the `bots` feature enabled
- The handler function receives `medplum` (SDK instance) and `event` (operation context)
- `event.input` contains the operation input (request body for POST, query params for GET)
- Return value becomes the operation output

### Step 2: Deploy the Bot

Deploy your Bot code using the `$deploy` operation:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Bot/{bot-id}/\$deploy" \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer {access-token}" \
  -d '{
    "code": "exports.handler = async function (medplum, event) { ... }"
  }'
```

### Step 3: Create an OperationDefinition

Create an `OperationDefinition` that describes your operation and links to your `Bot`:

```json
{
  "resourceType": "OperationDefinition",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation",
      "valueReference": {
        "reference": "Bot/{bot-id}"
      }
    }
  ],
  "name": "my-custom-operation",
  "status": "active",
  "kind": "operation",
  "code": "my-custom-operation",
  "system": true,
  "type": false,
  "instance": false,
  "parameter": [
    {
      "use": "in",
      "name": "input",
      "type": "Patient",
      "min": 1,
      "max": "1"
    },
    {
      "use": "out",
      "name": "return",
      "type": "Patient",
      "min": 1,
      "max": "1"
    }
  ]
}
```

**Key Requirements:**

- Must include the `operationDefinition-implementation` extension
- Extension must reference a Bot resource
- Define appropriate input/output parameters

### Step 4: Invoke Your Custom Operation

Once deployed, you can invoke your custom operation like any standard FHIR operation:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Patient/\$my-custom-operation" \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer {access-token}" \
  -d '{
    "resourceType": "Patient",
    "name": [
      {
        "family": "Smith",
        "given": ["John"]
      }
    ]
  }'
```

## Operation Types

Custom operations support all standard FHIR operation types:

- **System-level operations**: `/fhir/R4/$my-operation`
- **Type-level operations**: `/fhir/R4/Patient/$my-operation`
- **Instance-level operations**: `/fhir/R4/Patient/123/$my-operation`

Configure the operation type using the `system`, `type`, and `instance` properties in your `OperationDefinition`.

## Input and Output Handling

### Input Processing

- **POST requests**: Request body is passed as `event.input`
- **GET requests**: Query parameters are passed as `event.input`
- Access to full request context via `event.headers`, etc.

### Output Processing

The `Bot`'s return value is automatically formatted according to the `OperationDefinition`'s output parameters. You can return:

- FHIR resources directly
- Primitive values (strings, numbers, booleans)
- Complex objects that match the defined output structure

## Security and Permissions

Custom operations inherit the security model of both Bots and FHIR operations:

- Users must have permission to read the Bot resource
- Bot execution follows the Bot's `runAsUser` configuration
- Standard FHIR access controls apply to the operation endpoint
- Operations can be system-level, type-level, or instance-level with appropriate permissions

## Error Handling

If your Bot encounters an error:

- Return an `OperationOutcome` resource for controlled error responses
- Thrown exceptions will be caught and converted to appropriate HTTP error responses
- Use standard FHIR error patterns for consistent client handling

## Example Use Cases

- **Data validation**: Custom validation rules beyond standard FHIR constraints
- **Data transformation**: Convert between different FHIR profiles or external formats
- **Integration**: Connect to external systems, APIs, or databases
- **Workflow automation**: Implement complex business processes
- **Reporting**: Generate custom reports or analytics
- **Decision support**: Implement clinical decision support algorithms

## Feedback and Support

We'd love your feedback on this beta feature! Please share:

- Use cases you're implementing
- Issues or limitations you encounter
- Suggestions for improvements
- Performance observations
