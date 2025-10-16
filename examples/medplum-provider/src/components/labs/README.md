# Lab Order Requisition PDF Display

This feature displays Lab Order Requisition PDFs in the Orders content section when a ServiceRequest is selected.

## How it works

1. When a user selects an order from the order list, the `LabOrderDetails` component is rendered
2. The component extracts the Health Gorilla Requisition ID from the ServiceRequest's `requisition` field
3. The component searches for `DocumentReference` resources that:
   - Have a category of "LabOrderRequisition"
   - Have an identifier with system "https://www.healthgorilla.com" and value matching the Requisition ID
4. If found, the PDF attachments are displayed using the `AttachmentDisplay` component
5. Users can view the PDF directly in the browser or download it

## Implementation Details

### Files Modified/Created

- `src/utils/documentReference.ts` - Utility function to fetch Lab Order Requisition documents
- `src/components/labs/LabOrderDetails.tsx` - Updated to display PDF previews

### Key Components

- `fetchLabOrderRequisitionDocuments()` - Searches for DocumentReference resources with LabOrderRequisition category using Health Gorilla Requisition ID
- `getHealthGorillaRequisitionId()` - Extracts the Health Gorilla Requisition ID from ServiceRequest
- `AttachmentDisplay` - Medplum React component that renders PDFs in an iframe
- Lab Order Requisition section in `LabOrderDetails` - Shows loading state, documents, or "no documents found" message

### ServiceRequest Structure

The ServiceRequest should have a Health Gorilla Requisition ID:

```json
{
  "resourceType": "ServiceRequest",
  "requisition": {
    "system": "https://www.healthgorilla.com",
    "value": "123456"
  }
}
```

### DocumentReference Structure

The DocumentReference resources should have:

```json
{
  "resourceType": "DocumentReference",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/document-classcodes",
          "code": "LabOrderRequisition",
          "display": "Lab Order Requisition"
        }
      ]
    }
  ],
  "identifier": [
    {
      "system": "https://www.healthgorilla.com",
      "value": "123456"
    }
  ],
  "content": [
    {
      "attachment": {
        "contentType": "application/pdf",
        "url": "https://example.com/document.pdf"
      }
    }
  ]
}
```

## Testing

To test this functionality:

1. Create a ServiceRequest resource with a `requisition` field containing a Health Gorilla ID:
   ```json
   {
     "requisition": {
       "system": "https://www.healthgorilla.com",
       "value": "123456"
     }
   }
   ```
2. Create a DocumentReference resource with:
   - `category` set to "LabOrderRequisition"
   - `identifier` with system "https://www.healthgorilla.com" and the same value as the ServiceRequest
   - `content.attachment` with a PDF URL
3. Navigate to the Labs page and select the order
4. The PDF should appear in the "LAB ORDER REQUISITION" section

## Notes

- The search uses the FHIR `identifier` parameter to match DocumentReference resources by Health Gorilla Requisition ID
- The matching is done by extracting the Health Gorilla ID from the ServiceRequest's `requisition` field
- PDFs are displayed using an iframe with `#navpanes=0` to hide navigation
- The component handles loading states and error cases gracefully
- Multiple documents can be displayed if multiple DocumentReference resources are found with the same Health Gorilla ID
