---
sidebar_position: 27
---

# ChargeItemDefinition $apply

The `$apply` operation applies a `ChargeItemDefinition` resource to a specific `ChargeItem`, calculating the appropriate pricing based on the definition's property groups and applicability rules.

## Use Cases

- **Automated Pricing Calculations**: Automatically calculate prices for lab tests, procedures, or services based on predefined rules
- **Insurance-Specific Rates**: Apply different pricing based on payer contracts or insurance types
- **Dynamic Discount Management**: Calculate surcharges or discounts based on patient eligibility or service context
- **Revenue Cycle Automation**: Streamline billing workflows by programmatically determining charge amounts

## Invocation

```
POST [base]/ChargeItemDefinition/[id]/$apply
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `chargeItem` | 1..1 | `Reference<ChargeItem>` | Reference to the ChargeItem to which pricing should be applied |

## Output

The operation returns the updated `ChargeItem` resource with the `priceOverride` field set based on the `ChargeItemDefinition`'s pricing rules.

## Behavior

The operation processes the `ChargeItemDefinition`'s `propertyGroup` elements to determine pricing:

1. **Base Price**: Finds the first applicable property group with a `priceComponent` of type `base` and uses its amount
2. **Applicability**: Evaluates FHIRPath expressions in `applicability` conditions against the `ChargeItem` to determine if a property group applies
3. **Price Modifiers**: Applies `surcharge` and `discount` price components:
   - **Surcharge**: Adds the amount or calculates `basePrice * factor`
   - **Discount**: Subtracts the amount or calculates `basePrice * factor`

## Example

### Request

```http
POST /fhir/R4/ChargeItemDefinition/lab-panel-pricing/$apply
Content-Type: application/fhir+json

{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "chargeItem",
      "valueReference": {
        "reference": "ChargeItem/abc123"
      }
    }
  ]
}
```

### Response

```json
{
  "resourceType": "ChargeItem",
  "id": "abc123",
  "status": "billable",
  "code": {
    "coding": [
      {
        "system": "http://example.org/lab-codes",
        "code": "PANEL001"
      }
    ]
  },
  "subject": {
    "reference": "Patient/patient123"
  },
  "priceOverride": {
    "value": 150.00,
    "currency": "USD"
  }
}
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | Missing required `chargeItem` parameter |
| `404 Not Found` | ChargeItemDefinition or ChargeItem not found |
| `403 Forbidden` | Insufficient permissions |

## Related Documentation

- [FHIR ChargeItemDefinition $apply Operation](https://www.hl7.org/fhir/chargeitemdefinition-operation-apply.html)
- [ChargeItemDefinition Resource](https://www.hl7.org/fhir/chargeitemdefinition.html)
- [ChargeItem Resource](https://www.hl7.org/fhir/chargeitem.html)
