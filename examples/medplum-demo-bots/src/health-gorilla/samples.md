# Sample Data

[Health Gorilla](https://www.healthgorilla.com/) is an interoperability platform that supports diagnostics (labs/imaging) orders and results. This guide provides examples of FHIR data that conforms to Health Gorilla requirements.

Apart from standard FHIR fields, there are specifics in Health Gorilla FHIR that are required for an integration to be successful. This guide documents required fields. Health Gorilla publishes a list of requirements on their [FHIR Profile](https://developer.healthgorilla.com/docs/fhir-profiles) page which is more comprehensive, but this material is meant to give you the minimal set of required fields to send orders and receive results.

Coming soon: FHIR Profile specifically for Health Gorilla

## Patient

The patient must have a `country` in their address and a Medical record number as specified in the example. They also must have an `email` address under `telecom` as shown.

```json
{
  "resourceType": "Patient",
  "identifier": [
    {
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
            "code": "MR",
            "display": "Medical record number"
          }
        ],
        "text": "Medical record number"
      },
      "value": "55555558"
    },
    {
      "system": "https://www.healthgorilla.com",
      "value": "df39fa64131a52bfae9848ae"
    }
  ],
  "name": [
    {
      "given": ["Homer"],
      "family": "Simpson"
    }
  ],
  "gender": "male",
  "birthDate": "1962-06-15",
  "address": [
    {
      "line": ["2425 Sutter St"],
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94115",
      "country": "US"
    }
  ],
  "telecom": [
    {
      "system": "email",
      "use": "home",
      "value": "homer@example.com"
    },
    {
      "system": "phone",
      "use": "home",
      "value": "4158006122"
    }
  ]
}
```

## Practitioner

The integration uses the identifier from the `https://www.healthgorilla.com` system to match identities. You can optionally store NPI for record keeping as shown below.

```json
{
  "resourceType": "Practitioner",
  "name": [
    {
      "given": ["Alice"],
      "family": "Smith"
    }
  ],
  "identifier": [
    {
      "value": "80ef2c64524ee10b76af5126",
      "system": "https://www.healthgorilla.com"
    },
    {
      "system": "http://hl7.org/fhir/sid/us-npi",
      "value": "1790970747"
    }
  ]
}
```

## Organization

The identifiers and addresses on an organization are crucial for data correctness. Example shown below. You will need a `https://www.healthgorilla.com` system identifier as shown in the example that will represent the diagnostics providers. `Organizations` can be hierarchical as shown in the example, and the hierarchy should use the Health Gorilla identifiers. The contact details are a nice-to-have, it can be useful to preserve the customer success contacts in your applications for use by your end users.

```json
{
  "resourceType": "Organization",
  "name": "Labcorp (official)",
  "telecom": [
    {
      "system": "phone",
      "value": "8006315250"
    }
  ],
  "address": [
    {
      "line": ["69 First Avenue"],
      "city": "Raritan",
      "state": "NJ",
      "postalCode": "088691800"
    }
  ],
  "partOf": {
    "reference": "Organization/f-388554647b89801ea5e8320b",
    "display": "LabCorp HQ"
  },
  "contact": [
    {
      "purpose": {
        "coding": [
          {
            "system": "http://hl7.org/fhir/contactentity-type",
            "code": "ADMIN"
          }
        ]
      },
      "name": {
        "family": "Alice",
        "given": ["Smith"],
        "suffix": ["MD"]
      }
    }
  ],
  "identifier": [
    {
      "value": "f-388554647b89801ea5e8320b",
      "system": "https://www.healthgorilla.com"
    }
  ]
}
```

TODO: Document how to find and synchronize `Organization` identifiers from Health Gorilla.

## Coverage

The `Coverage` resource is a representation of the insurance card. For `Coverage` the references and coding are important. Identifiers should point to the Medplum resources, but particularly for payor `Organization`s, for the integration to work it will require the correct production identifier from the `https://www.healthgorilla.com` system.

It's very important that the `Coverage.payor` resource points to the `Organization` that corresponding to the correct payor. Payors can have the same or similar display names.

```json
{
  "resourceType": "Coverage",
  "status": "active",
  "beneficiary": {
    "reference": "Patient/<medplum-uuid>",
    "display": "Homer Simpson"
  },
  "payor": [
    {
      "reference": "Organization/<medplum-uuid>",
      "display": "Medicare Complete"
    }
  ],
  "class": [
    {
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/coverage-class",
            "code": "group",
            "display": "Group"
          }
        ],
        "text": "Group"
      },
      "value": "GN123456"
    }
  ],
  "relationship": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
        "code": "parent",
        "display": "Parent"
      }
    ],
    "text": "Parent"
  },
  "subscriber": {
    "reference": "RelatedPerson/<medplum-uuid>",
    "display": "TC2MOM TEST"
  }
}
```

## Account

When orders are placed, you'll need to ensure that all of the billing data is complete and well-formed. An Account is the primary way to indicate who to bill for an order. The [Health Gorilla Account](https://developer.healthgorilla.com/docs/diagnostic-network#account) documentation spells out the permutations.

At a high level, you'll create an `Account` resource attached to the order, which indicates who will pay for that order.

If you are billing patient insurance, you'll need to attach the correct `Coverage` resource(s) to the `Account`. Billing insurance supports the following permutations:

- One or more `Coverage` resources representing multiple insurances that can be billed in priority order, representing Primary, Secondary and Tertiary insurances for a patient.
- Billing the insurance of a related person is supported when linked to an account, for example labs for a child can be billed to a parent's insurance.

For correct billing the the `Coverage` resources should point to to the correct `subscriber` - the patient themselves or another person.

Health Gorilla supports primary and secondary `Coverage` resources. Populate them as shown in priority order.

The `Account` resource `meta` should include the Health Gorilla [Account Profile](https://developer.healthgorilla.com/docs/fhir-profiles#health-gorilla-order-billing-account). The Account `type` should match one of the types in the Health Gorilla [`order-billto`` to ValuesSet](https://developer.healthgorilla.com/docs/fhir-value-sets#order-billto)

```json
{
  "resourceType": "Account",
  "status": "active",
  "name": "Homer Simpson - Bill to Medicare",
  "id": "ff3128d8-ff6f-4e6e-abd2-930b7b723ebf",
  "meta": {
    "profile": ["https://healthgorilla.com/fhir/StructureDefinition/hg-order-account"]
  },
  "type": {
    "coding": [
      {
        "system": "https://healthgorilla.com/fhir/StructureDefinition/hg-order-account",
        "code": "thirdParty",
        "display": "Third Party"
      },
      {
        "system": "https://www.healthgorilla.com/order-billto",
        "code": "thirdParty",
        "display": "Third Party"
      }
    ]
  },
  "coverage": [
    {
      "coverage": {
        "reference": "Coverage/<medplum-uuid>"
      },
      "priority": 1
    },
    {
      "coverage": {
        "reference": "Coverage/<medplum-uuid>"
      },
      "priority": 2
    }
  ]
}
```

## Scenarios

The following sample test scenarios are useful to understand when preparing for an integration.

- PSC HOLD - in a Quest ordering workflow this refers to an order with no Specimen details. In this case, the order is placed but the patient has to go to a Quest center to have a specimen collection. PSC stands for "Patient Service Center." The requisition form and details will show PSC HOLD on them.
- Advance Beneficiary Notice (ABN) - this refers to a Medicare or Medicaid workflow where the patient receives notice of their coverage for the lab test before the test is performed. Health Gorilla provides this as a PDF that should be stored for record keeping. For Medicare and Medicaid you will need to submit diagnosis codes with the order.
- Clinical Note - this refers to a note at the test level placed as part of an order, for example if an order is placed for a Free T4 and a TSH test, the Free T4 and TSH test could each have their own clinical note.
