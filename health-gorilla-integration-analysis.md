# Health Gorilla Integration Analysis

This document addresses specific questions about the Medplum Health Gorilla integration based on a deep dive into the codebase.

---

## 1. ServiceRequest and Form Generation

### Question: Do we need a specific HG form for Quest?

**Answer: No, you do not need a specific Health Gorilla form for Quest or any other lab.**

The integration uses a "headless UX" approach where:

1. You create a `ServiceRequest` with the required data (patient, requester, lab, tests, diagnoses, billing info)
2. The `send-to-health-gorilla` bot transforms this into the appropriate Health Gorilla API format internally
3. Health Gorilla handles the lab-specific requirements on their side

The same workflow works for Quest, LabCorp, and other connected labs - you just select a different performing lab. The React components (`useHealthGorillaLabOrder` hook and `HealthGorillaLabOrderProvider`) handle state management without requiring lab-specific forms.

**Reference:** `packages/docs/docs/integration/health-gorilla/sending-orders.md` (lines 29-58)

---

### Question: Do we need to create a Questionnaire to trigger the ServiceRequest?

**Answer: No, you do not need to create a Questionnaire resource to trigger a ServiceRequest.**

The lab order creation flow is:

1. **Create ServiceRequest directly** using `createLabOrderBundle()` from `@medplum/health-gorilla-core`
2. **Execute the bot** with the ServiceRequest: `sendLabOrderToHealthGorilla(medplum, serviceRequest)`

The only Questionnaires involved are **AOE (Ask on Entry) questionnaires**, which:
- Are **test-specific** (not order-triggering)
- Are **fetched automatically** from Health Gorilla when you select a test
- Contain questions like "Fasting status?" required for certain tests
- Are stored as `QuestionnaireResponse` resources linked to individual test `ServiceRequests`

**Reference:** `packages/health-gorilla-core/src/lab-order.ts` (lines 247-256)

```typescript
// AOE responses are created per-test, not for triggering orders
if (metadata?.aoeResponses) {
  qr = deepClone(metadata.aoeResponses);
  qr.id = tempId();
  bundleEntry.push({
    fullUrl: qr.id,
    resource: qr,
    request: { method: 'POST', url: 'QuestionnaireResponse' },
  });
}
```

---

## 2. Handling Detected Issues and Retries

### Current DetectedIssue Types

The integration currently creates `DetectedIssue` resources for two scenarios:

| Code | Scenario | Description |
|------|----------|-------------|
| `unsolicited-diagnostic-report` | Results without matching order | Lab received orders from external sources (phone, website) |
| `unknown-patient` | Results for unknown patient | Patient not found in your Medplum project |

**Important:** These are informational issues for workflow management, not blocking errors. The results are still imported.

**Reference:** `packages/docs/docs/integration/health-gorilla/receiving-results.md` (lines 355-389)

---

### Question: Would the retry process be an update of the existing ServiceRequest or a new one?

**Answer: It depends on the scenario.**

#### Scenario A: Order Splitting Required (Lab-initiated)

If Health Gorilla returns an `order-splitting-required` error:

```json
{
  "resourceType": "OperationOutcome",
  "extension": [{
    "url": "https://api.healthgorilla.com/fhir/R4/fhir/StructureDefinition/operationoutcome-order-splitting",
    "valueString": "436|1877;9230;900323"
  }],
  "issue": [{
    "severity": "fatal",
    "code": "processing",
    "details": {
      "coding": [{ "code": "order-splitting-required" }]
    }
  }]
}
```

**Process:**
1. Call the `split-order` bot with the original order and grouping info
2. Bot creates **NEW parent ServiceRequests** for each group
3. Original order is set to `entered-in-error` status
4. New orders use `ServiceRequest.replaces` to maintain audit trail
5. Each new order can be resubmitted to `send-to-health-gorilla`

**Reference:** `packages/docs/docs/integration/health-gorilla/sending-orders.md` (lines 348-401)

#### Scenario B: Insurance/Business Rejection (Hypothetical)

For business rejections (e.g., insurance not covered), the integration **does not currently have automated retry handling**. The recommended approach:

1. **Check ServiceRequest status** - errors put the order in `on-hold` status
2. **Review error details** - available in the bot response/outcome
3. **Create a NEW ServiceRequest** - because once submitted (`active`), orders are immutable in the lab's system

**Key constraint from docs:**

> "Important: Once an order becomes `active`, it cannot be modified in the lab's system, even if updated in Medplum."

**Therefore, for retry scenarios:**
- **Cannot update the existing ServiceRequest** to trigger a resend (the downstream lab considers it immutable)
- **Must create a new ServiceRequest** with corrected information
- Original order should be set to `revoked` or left in `on-hold`

#### Recommended Retry Workflow for Insurance Issues:

```typescript
// 1. Detect the issue (e.g., from bot subscription or DetectedIssue monitoring)
// 2. Revoke/cancel the original order
await medplum.updateResource({
  ...originalOrder,
  status: 'revoked'
});

// 3. Create a new order with corrected billing/coverage
const { serviceRequest: newOrder } = await createOrderBundle({
  ...originalOrderInputs,
  billingInformation: correctedBillingInfo
});

// 4. Submit the new order
await sendLabOrderToHealthGorilla(medplum, newOrder);
```

---

## 3. Issues with Selected Tests Population

### Question: What is the expected configuration for tests to populate for Quest Diagnostics?

**Answer: Tests are dynamically fetched from Health Gorilla's API based on the selected lab.**

The test selection flow:

1. **Select a performing lab first** (e.g., Quest Diagnostics)
2. **Search for tests** - uses the `autocomplete` bot which queries Health Gorilla's API
3. **Tests returned are lab-specific** - tied to that lab's compendium

**Reference:** `packages/health-gorilla-react/src/useHealthGorillaLabOrder.ts` (lines 437-454)

```typescript
searchAvailableTests: async (query: string): Promise<TestCoding[]> => {
  if (!performingLab) {
    return [];  // No lab = no tests
  }

  const hgLabId = getIdentifier(performingLab, HEALTH_GORILLA_SYSTEM);
  if (!hgLabId) {
    throw new Error('No Health Gorilla identifier found for performing lab');
  }

  const response = await healthGorillaAutocomplete<TestSearch>({
    type: 'test',
    query,
    labId: hgLabId  // Tests are fetched for this specific lab
  });

  return response.result;
}
```

### Configuration Requirements

**On Medplum side:**
- Install the Health Gorilla bots (autocomplete, send-to-health-gorilla, receive-from-health-gorilla)
- Ensure bot identifier: `health-gorilla-labs/autocomplete`

**On Health Gorilla side:**
- Your Health Gorilla account must be connected to Quest Diagnostics
- Your account number with Quest must be configured
- Quest's test compendium is managed by Health Gorilla

**You do NOT need to:**
- Manually configure test lists on your side
- Create ValueSets for available tests
- Maintain a Quest-specific compendium

The `autocomplete` bot proxies requests to Health Gorilla's API, which returns tests from Quest's compendium based on your account setup.

---

## 4. ValueSet `http://hl7.org/fhir/sid/icd-10-cm` Not Found

### Question: Does Medplum handle adding the diagnostic code ValueSet? Is this a manual step in Health Gorilla or a configuration change on our side?

**Answer: This is handled by Medplum's `ValueSetAutocomplete` component, not Health Gorilla.**

The ICD-10-CM ValueSet (`http://hl7.org/fhir/sid/icd-10-cm`) is a standard FHIR terminology. Here's how it works:

**Reference:** `examples/medplum-provider/src/pages/labs/OrderLabsPage.tsx` (lines 202-212)

```tsx
<ValueSetAutocomplete
  label="Diagnoses"
  binding="http://hl7.org/fhir/sid/icd-10-cm"
  name="diagnoses"
  maxValues={10}
  onChange={(items) => {
    const codeableConcepts = items.map((item) => ({ coding: [item] })) as DiagnosisCodeableConcept[];
    setDiagnoses(codeableConcepts);
  }}
/>
```

### Configuration Options

**Option 1: Use Medplum's Terminology Service (Recommended)**

Medplum provides terminology services for ICD-10-CM. The `ValueSetAutocomplete` component will:
- Query the `$expand` operation on the ValueSet
- Return matching codes based on user input

Ensure your Medplum project has access to the terminology service. This may require:
- A Medplum account with terminology features enabled
- Proper project configuration

**Option 2: Import the ValueSet Manually**

If you need the ValueSet locally:

1. Download ICD-10-CM from official sources (CMS, NLM)
2. Import via Medplum's `$import` operation or batch upload
3. The `ValueSetAutocomplete` will then query your local copy

**Option 3: Use a Subset/Custom ValueSet**

Medplum docs mention a sample diagnosis code file for common codes:
> "a sample ValueSet with common ICD-10 codes can be [downloaded](https://drive.google.com/file/d/1cFHGBud9IlGH86yilxe-KkDxGUbGr2Mn/view?usp=drive_link)"

You can:
1. Download this sample
2. Import as a custom ValueSet
3. Reference the custom URL in your binding

**Reference:** `packages/docs/docs/integration/health-gorilla/index.md` (lines 71-77)

### What Health Gorilla Expects

Health Gorilla expects ICD-10 codes in `ServiceRequest.reasonCode`:

```typescript
// From lab-order.ts line 338
reasonCode: diagnoses,  // DiagnosisCodeableConcept[]
```

The format expected:
```json
{
  "coding": [{
    "system": "http://hl7.org/fhir/sid/icd-10-cm",
    "code": "D63.1"
  }],
  "text": "D63.1"
}
```

**Conclusion:** The "ValueSet not found" error is a Medplum configuration issue, not Health Gorilla. Either:
- Enable terminology services for your project
- Import the ICD-10-CM ValueSet
- Use the sample diagnosis codes ValueSet from the docs

---

## Summary Table

| Question | Answer |
|----------|--------|
| Need specific HG form for Quest? | No - same workflow for all labs |
| Need Questionnaire to trigger ServiceRequest? | No - AOE Questionnaires are test-specific, not triggers |
| Retry: Update existing or create new? | **Create new** - active orders are immutable in lab systems |
| Tests tied to lab configuration? | Yes - fetched dynamically from Health Gorilla API per lab |
| ICD-10 ValueSet setup | Medplum side - enable terminology service or import ValueSet |

---

## Key File References

| Purpose | File Path |
|---------|-----------|
| Lab order creation | `packages/health-gorilla-core/src/lab-order.ts` |
| React hooks/state | `packages/health-gorilla-react/src/useHealthGorillaLabOrder.ts` |
| AOE handling | `packages/health-gorilla-core/src/aoe.ts` |
| Example implementation | `examples/medplum-provider/src/pages/labs/OrderLabsPage.tsx` |
| Sending orders docs | `packages/docs/docs/integration/health-gorilla/sending-orders.md` |
| Receiving results docs | `packages/docs/docs/integration/health-gorilla/receiving-results.md` |
