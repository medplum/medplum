---
keywords:
  - drugs
  - formulary
  - medication
---

# Modeling a Formulary

## Introduction

A formulary is a catalog of drugs offered by your organization. When implementing a custom EMR, you may want to include essential metadata about these drugs to help prescribing physicians, pharmacists, and patients.

The principal resource for building a digital formulary is the [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) resource. This guide aims to explore the most pertinent attributes of [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) for digital health providers.

This guide is informed by the [DaVinci Payer Data Exchange (PDex) US Drug Formulary](https://build.fhir.org/ig/HL7/davinci-pdex-formulary/index.html) implementation guide. [The Da Vinci Project](http://www.hl7.org/about/davinci/index.cfm) includes industry leaders, including Humana, Cigna, and Optum, who are using FHIR to support value-based care. You can check out how Humana implements this API [here](https://developers.humana.com/apis/drug-formulary-api/doc).

## Drug Code

When defining `MedicationKnowledge.code`, it's highly recommended to use RxNorm as the primary coding system. The Da Vinci guide distinguishes two different types of codes: "semantic drugs" (mandatory) and "semantic drug form group" (optional).

- "Semantic drugs" equate to the RxNorm term types of `Semantic Clinical Drug (SCD)`, `Semantic Branded Drug (SBD)`, `Generic Pack (GPCK)`, or `Branded Pack (BPCK)`,
- "Semantic drug form group" matches the term types of `Semantic Clinical Drug Form (SCDG)` and `Semantic Branded Drug Form Group (SBDG)`.

For a deeper understanding of RxNorm, refer to our [RxNorm guide](./medication-codes).

## Drug Characteristics

Details about the physical characteristics of a drug, such as its color, shape, size, and imprint, can be found in the `drugCharacteristics` section of the [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) resource. The [Medication knowledge characteristic code](http://hl7.org/fhir/R4/valueset-medicationknowledge-characteristic.html) valueset can be a handy reference for examples of `MedicationKnowledge.drugCharacteristics.type`.

Other metadata fields to note include `packaging`, `doseForm`, and `intendedRoute`.

- The `packaging` attribute represents the type of packaging and quantity of the drug in the package. For instance, `'{tbl}'` is used to indicate a tablet. More details can be found in the [MedicationKnowledge Package Type Codes](http://hl7.org/fhir/R4/valueset-medicationknowledge-package-type.html) and the guide to [units of measure](https://terminology.hl7.org/4.0.0/ValueSet-v3-UnitsOfMeasureCaseSensitive.html).
- The `doseForm` attribute is used to indicate the physical form of the medication, for example, whether it is a liquid, powder, pill, etc. The [SNOMED Form Codes](http://hl7.org/fhir/R4/valueset-medication-form-codes.html) can be used for reference.
- The `intendedRoute` attribute suggests how the drug is to be ingested, whether orally, intravenously, etc. The [SNOMED Route Codes](http://hl7.org/fhir/R4/valueset-route-codes.html) are available for more information.

We will be providing a comprehensive example of a [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) resource that incorporates drugCharacteristics, packaging, doseForm, and intendedRoute.

:::note A note about units

All units for medication quantities are [UCUM units of measure](https://terminology.hl7.org/4.0.0/ValueSet-v3-UnitsOfMeasureCaseSensitive.html). This includes standard SI units, as well as healthcare specific unit codes. A common unit for medications is `{tbl}`, which stands for "tablets", which is useful for quantifying the amount of medication in a package.

:::

<details>
<summary>
Example Drug Characteristics
</summary>

```ts
{
  resourceType: 'MedicationKnowledge',
  code: {
    text: 'acetaminophen 325 MG [Tylenol]',
    coding: [
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '569998',
      },
      {
        system: 'http://hl7.org/fhir/sid/ndc',
        code: '5058049501',
      },
    ],
  },
  drugCharacteristic: [
    {
      type: {
        text: 'Color',
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-characteristic',
            code: 'color',
          },
        ],
      },
      valueString: 'white',
    },
    {
      type: {
        text: 'Imprint Code',
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-characteristic',
            code: 'imprintcd',
          },
        ],
      },
      valueString: 'Tylenol',
    },
  ],
  amount: {
    value: 100,
    unit: '{tbl}',
  },
  packaging: {
    type: {
      text: 'Bottle',
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-package-type',
          code: 'bot',
          display: 'Bottle',
        },
      ],
    },
    quantity: {
      value: 100,
      unit: '{tbl}',
    },
  },
  doseForm: {
    text: 'tablet',
  },
  intendedRoute: [
    {
      text: 'oral',
    },
  ],
  //...
}
```

</details>

## Drug Classifications and Regulations

The `MedicationKnowledge.productType` field can be used to categorize the drug within the formulary, potentially along multiple dimensions. This field can also be used to describe:

- Whether a drug is generic or branded
- Whether the drug is prescribable
- Whether the drug is dispensable
- Whether the drug requires a prescription (see: [Legal status of Supply](https://build.fhir.org/valueset-legal-status-of-supply.html))

The `MedicationKnowledge.regulatory` contains crucial regulatory information related to drug dispensing, such as maximum permissible units and substitution regulations. In particular, `MedicationKnowledge.regulatory.schedule.schedule` is used for specifying the regulatory schedule for controlled substances.

Refer to the [HL7 Controlled Substances Schedule](https://terminology.hl7.org/ValueSet-v2-0477.html) for an example valueset for substances subject to the U.S. Controlled Substances Act (CSA).

## Compounded Medications

The `MedicationKnowledge.ingredients` field is used for listing ingredients of compounded medications, with RxNorm as the preferred code system for reach ingredient.

The `MedicationKnowledge.amount` field indicates the total amount of the compound to be dispensed.

For each ingredient, the `strength` is stored as a ratio of the total volume (e.g. 1g per 100g). The field `ingredient.active` indicates which of the listed ingredients are active.

```ts
{
  resourceType: 'MedicationKnowledge',
  // Dispense 200g total
  amount: {
    value: 200,
    unit: 'g',
    system: 'http://unitsofmeasure.org',
  },
  // Each ingredient strength is listed as a ratio out of 100g
  ingredient: [
    {
      isActive: true,
      itemCodeableConcept: {
        text: 'Baclofen powder',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1292',
          },
        ],
      },
      strength: {
        numerator: {
          value: 5,
          unit: 'g',
          system: 'http://unitsofmeasure.org',
        },
        denominator: {
          value: 100,
          unit: 'g',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      isActive: true,
      itemCodeableConcept: {
        text: 'Ketoprofen powder',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '6142',
          },
        ],
      },
      strength: {
        numerator: {
          value: 10,
          unit: 'g',
          system: 'http://unitsofmeasure.org',
        },
        denominator: {
          value: 100,
          unit: 'g',
        },
      },
    },
    {
      isActive: true,
      itemCodeableConcept: {
        text: 'Capcaicin 0.75 mg/mL topical lotion',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1992',
          },
        ],
      },
      strength: {
        numerator: {
          value: 0.075,
          unit: 'g',
        },
        denominator: {
          value: 100,
          unit: 'g',
        },
      },
    },
    {
      isActive: true,
      itemCodeableConcept: {
        text: 'Tetracaine 10 mg/mL topical cream',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '10391',
          },
        ],
      },
      strength: {
        numerator: {
          value: 2,
          unit: 'g',
        },
        denominator: {
          value: 100,
          unit: 'g',
        },
      },
    },
    {
      isActive: false,
      itemCodeableConcept: {
        text: 'PLO flowable Pluronic Lecithin Organogel',
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '012345',
          },
        ],
      },
      strength: {
        numerator: {
          value: 82.9,
          unit: 'g',
        },
        denominator: {
          value: 100,
          unit: 'g',
        },
      },
    },
  ],
  packaging: {
    type: {
      text: 'Tube',
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-package-type',
          code: 'tube',
          display: 'Tube',
        },
      ],
    },
  },
//...
}
```

## Related Drugs

Relationships between drugs, for example brand names vs. generics, bioequivalent products, etc. are modeled using the `MedicationKnowledge.relatedMedicationKnowledge` field. Refer to the [RxNORM relationship codes](https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix1.html) for an example code system of relationships between drugs.

## Images and Other Documents

Supplemental images and documentation should be referenced from `MedicationKnowledge.monograph`. This can include images, label information, supplemental patient instructions, etc.

For these external files, implementers should create a [`DocumentReference`](/docs/api/fhir/resources/documentreference) resource, and reference it from `MedicationKnowledge.monograph`. For more information on handling external files, consult our guide on [Handling External Files](/docs/charting/external-documents).

## See Also

- Guide on [Medication Code Systems](./medication-codes.md)
- [DaVinci Payer Data Exchange (PDex) US Drug Formulary](https://build.fhir.org/ig/HL7/davinci-pdex-formulary/index.html) implementation guide
- [Humana Drug Formulary API](https://developers.humana.com/apis/drug-formulary-api/doc)
