import ExampleCode from '!!raw-loader!@site/..//examples/src/binaries/create-media.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Binary Security Context

FHIR Binary resources require special attention when implementing access controls in Medplum. Unlike other FHIR resources, Binary resources cannot use standard compartment-based access policies and must rely on the `securityContext` element for proper access control.

**Critical Point**: Binary resources without a `securityContext` fall back to project-level access controls, potentially exposing sensitive data to any authenticated user with Binary resource permissions.

## Security Model

### Standard FHIR Resources

Most FHIR resources (Patient, Observation, DiagnosticReport, etc.) can be secured using compartment-based access policies:

```json
{
  "resourceType": "AccessPolicy",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%patient"
    }
  ]
}
```

### Binary Resources - Special Case

Binary resources **cannot** use compartment-based access controls. They require explicit `securityContext` declaration:

```json
{
  "resourceType": "Binary",
  "id": "example-binary",
  "contentType": "application/pdf",
  "securityContext": {
    "reference": "Patient/homer-simpson"
  }
}
```

## Risk Assessment

### Without securityContext

- **Access Control**: Falls back to basic project permissions
- **Risk Level**: Medium to High (depending on data sensitivity)
- **Exposure**: Any authenticated user with `{ "resourceType": "Binary" }` permissions can access if they know the UUID
- **UUID Security**: While 128-bit UUIDs provide practical obscurity, they can be exposed through:
  - Application logs
  - Network traffic
  - Browser history/developer tools
  - Error messages
  - Database exports
  - Accidentally shared URLs

### With securityContext

- **Access Control**: Inherits permissions from referenced resource
- **Risk Level**: Low (follows established access patterns)
- **Exposure**: Only users with access to the referenced resource (e.g., Patient) can access the Binary

## Implementation Best Practices

### 1. HTTP API Binary Upload (Most Common)

Most developers create Binary resources by uploading raw binary content via HTTP POST:

```bash
# Recommended - Using X-Security-Context header
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/pdf" \
  -H "X-Security-Context: Patient/homer-simpson" \
  --data-binary "@patient-report.pdf" \
  https://api.medplum.com/fhir/R4/Binary
```

```bash
# Not recommended - Missing security context
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/pdf" \
  --data-binary "@patient-report.pdf" \
  https://api.medplum.com/fhir/R4/Binary
# This creates a Binary without securityContext!
```

The `X-Security-Context` header is the FHIR standard method for setting Binary security context during upload.

### 2. MedplumClient.createMedia (Recommended for SDK Users)

**Best Practice**: Use `MedplumClient.createMedia()` when possible, as it automatically handles security context: 

```typescript
// Recommended - createMedia automatically sets securityContext
<MedplumCodeBlock language="ts" selectBlocks="createMedia">
  {ExampleCode}
</MedplumCodeBlock>

// The associated Binary resource will automatically have:
// securityContext: { reference: "Media/[media-id]" }
```

Benefits of using `createMedia`:

- Automatically creates both Media and Binary resources
- Binary gets `securityContext` pointing to the Media resource
- Media resource inherits compartment-based access controls
- Provides better metadata and searchability than standalone Binary

### 3. Medplum React Components

Medplum React components that handle file uploads automatically use secure patterns:

#### AttachmentButton Component

```jsx
import { AttachmentButton } from '@medplum/react';

<AttachmentButton
  securityContext={createReference(resource)}
  onUpload={createMedia}
  onUploadStart={onUploadStart}
  onUploadProgress={onUploadProgress}
  onUploadError={onUploadError}
>
  {(props) => (
    <ActionIcon {...props} radius="xl" color="blue" variant="filled">
      <IconCloudUpload size={16} />
    </ActionIcon>
  )}
</AttachmentButton>;
```

#### AttachmentInput Component

```jsx
import { AttachmentInput } from '@medplum/react';

<AttachmentInput
  securityContext={createReference(patient)}
  onChange={(attachment) => {
    // Uploaded files automatically have proper securityContext
    console.log('New attachment:', attachment);
  }}
/>;
```

Both components use `MedplumClient.createMedia()` internally, ensuring proper security context.

### 4. Direct FHIR Resource Creation (Advanced)

When creating Binary resources directly as FHIR resources (less common):

```javascript
// Good - Always include securityContext
const binary = await medplum.createResource({
  resourceType: 'Binary',
  contentType: 'application/pdf',
  securityContext: {
    reference: `Patient/${patientId}`,
  },
});

// Bad - Missing securityContext
const binary = await medplum.createResource({
  resourceType: 'Binary',
  contentType: 'application/pdf',
  // Missing securityContext!
});
```

### 5. Choose Appropriate Security Context

| Use Case                                 | Recommended securityContext                     |
| ---------------------------------------- | ----------------------------------------------- |
| Patient documents (lab results, reports) | `Patient/[patient-id]`                          |
| Provider-specific content                | `Practitioner/[practitioner-id]`                |
| Organization documents                   | `Organization/[org-id]`                         |
| Encounter-specific files                 | `Encounter/[encounter-id]`                      |
| Media-associated files                   | `Media/[media-id]` (automatic with createMedia) |

### 6. Bot Development Guidelines

When creating Bots that generate Binary resources, prefer the HTTP API or createMedia approaches shown above. If creating Binary resources directly:

```javascript
// Good - Always include securityContext
const binary = await medplum.createResource({
  resourceType: 'Binary',
  contentType: 'application/pdf',
  securityContext: {
    reference: `Patient/${patientId}`,
  },
});

// Better - Use createMedia instead
const media = await medplum.createMedia({
  data: pdfData,
  filename: 'report.pdf',
  contentType: 'application/pdf',
  subject: { reference: `Patient/${patientId}` },
});
```

### 7. DiagnosticReport Integration

For DiagnosticReports with Binary attachments:

```json
{
  "resourceType": "DiagnosticReport",
  "subject": {
    "reference": "Patient/homer-simpson"
  },
  "presentedForm": [
    {
      "contentType": "application/pdf",
      "url": "Binary/report-binary-id"
    }
  ]
}
```

Ensure the Binary has matching securityContext:

```json
{
  "resourceType": "Binary",
  "id": "report-binary-id",
  "contentType": "application/pdf",
  "securityContext": {
    "reference": "Patient/homer-simpson"
  }
}
```

## Audit and Remediation

### Finding Binary Resources Without securityContext

Since Binary resources are not searchable, you can identify them through related resources:

1. **Through DiagnosticReports:**

```
GET /DiagnosticReport?_include=DiagnosticReport:presented-form
```

2. **Through DocumentReferences:**

```
GET /DocumentReference?_include=DocumentReference:content
```

3. **Through Media resources:**

```
GET /Media?_include=Media:content
```

### Remediation Script Example

```javascript
// Find DiagnosticReports and update associated Binaries
const diagnosticReports = await medplum.searchResources('DiagnosticReport');

for (const report of diagnosticReports) {
  if (report.presentedForm) {
    for (const form of report.presentedForm) {
      if (form.url && form.url.includes('/Binary/')) {
        const binaryId = form.url.split('/Binary/')[1];
        const binary = await medplum.readResource('Binary', binaryId);

        if (!binary.securityContext) {
          await medplum.updateResource({
            ...binary,
            securityContext: {
              reference: report.subject.reference,
            },
          });
        }
      }
    }
  }
}
```

For more details on how [`Binary`](/docs/api/fhir/resources/binary) resources are used in FHIR, see the [Binary Data docs](/docs/fhir-datastore/binary-data).

Remember: **Every Binary resource containing sensitive data should have a securityContext**. When in doubt, err on the side of more restrictive access controls.
