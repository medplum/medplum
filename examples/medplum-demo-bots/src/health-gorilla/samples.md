# Sample Data

[Health Gorilla](https://www.healthgorilla.com/) is an interoperability platform providing permitted access to actionable patient data. When placing orders and receiving results from Health Gorilla in FHIR, you'll need to ensure the following data is populated.

Apart from standard FHIR fields, there are some specifics with regards to the Health Gorilla integration that are required for an integration to be successful. This guide documents required fields. Health Gorilla publishes a list of requirements on their [FHIR Profile](https://developer.healthgorilla.com/docs/fhir-profiles) page which is more comprehensive, but this material is meant to give you the minimal set of required fields to send orders and receive results.

Coming soon: Medplum FHIR Profile specifically for Health Gorilla

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

The identifiers and addresses on an organization are crucial for data correctness. Example shown below. You will need a `https://www.healthgorilla.com` system identifier as shown in the example that will represent the diagnosics providers. `Organizations` can be hierarchical as shown in the example, and the hierarchy should use the Health Gorilla identifiers. The contact details are a nice-to-have, it can be useful to preserve the customer success contacts in your applications for use by your end users.

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

## Coverage

For `Coverage` the references and coding are important. See the examples below for reference. Identifiers are marked with `medplum-uuid` and `healthgorilla-id` where applicable. This is a representation of the insurance card.

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
      "reference": "Organization/<healthgorilla-id>",
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
        "code": "self",
        "display": "Self"
      }
    ],
    "text": "Self"
  },
  "subscriber": {
    "reference": "RelatedPerson/<medplum-uuid>",
    "display": "TC2MOM TEST"
  }
}
```

## Account

When orders are placed, you'll need to ensure that all of the billing data is complete and well-formed. To do that you'll need to have properly constructed FHIR Resources that will be used to generate a well formed order set.

Bill to insurance supports the following permutations:

- One or more `Coverage` resources representing multiple insurances that can be billed in priority order
- Billing the insurance of a related person, for example labs for a child are billed to a parent's insurance.

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
