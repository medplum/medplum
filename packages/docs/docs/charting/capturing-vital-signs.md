# Capturing Vital Signs

Vital signs are a group of important medical signs that measure the body's most vital (life-sustaining) functions. The four main vital signs are body temperature, pulse rate, respiration rate, and blood pressure. However, sometimes other measures, such as blood oxygen, weight, and blood glucose level, are included as well.

## The `Observation` Resource

| **Field**        | **Description**                                                                                                                                                                                                                                              | **Code System**                                                                                     | **Example**                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| status           | The status of the result value.                                                                                                                                                                                                                              | [Observation status types](http://hl7.org/fhir/R4/valueset-observation-status.html)                 | registered                                     |
| code             | A description of the observation, often called the observation "name".                                                                                                                                                                                       | [LOINC](https://www.medplum.com/docs/careplans/loinc)                                               | [8867-4](https://loinc.org/8867-4/) Heart Rate |
| subject          | A reference to who/what the observation is about.                                                                                                                                                                                                            |                                                                                                     | Patient/id=123                                 |
| encounter        | A reference to the healthcare event (patient/provider interaction) during which the observation was made.                                                                                                                                                    |                                                                                                     | Encounter/id=456                               |
| basedOn          | A plan, proposal, or order that is fulfilled by this observation.                                                                                                                                                                                            |                                                                                                     | CarePlan/id=789                                |
| performer        | Who performed the observation and is responsible for its accuracy. Useful to determine where foloow-ups should be directed                                                                                                                                   |                                                                                                     | Practitioner/id=135                            |
| value[x]         | The actual result(s) of the observation.                                                                                                                                                                                                                     | See below                                                                                           |                                                |
| dataAbsentReason | The reason why the result is missing.                                                                                                                                                                                                                        | [Observation data absent reason types](http://hl7.org/fhir/R4/valueset-data-absent-reason.html)     | asked-unknown                                  |
| interpretation   | A categorical assesment of the result. For example, high, low, or normal.                                                                                                                                                                                    | [Observation interpretation types](http://hl7.org/fhir/R4/valueset-observation-interpretation.html) | normal                                         |
| device           | The device used to generate the measurement. This can be medical or non-medical and can range from a simple tongue depressor to an MRI machine. Also includes personal and wearable devices such as smart phones or watches                                  |                                                                                                     | Device/id=246                                  |
| specimen         | The specimen from which the observation was derived. A sample of material taken from the patient on which laboratory testing or analysis was performed.                                                                                                      |                                                                                                     | Specimen/id=790                                |
| component        | Some observations have multiple component observations. These component observations are expressed as separate code value paris that share the same attributes. An example is systolic and diastolic component observations for blood pressure measurements. | See below                                                                                           |                                                |

Vital signs are stored as [`Observation`](/docs/api/fhir/resources/observation) resources. To track the specific vital that is being observed, use the `Observation.code` element. This describes what was observed, and is sometimes called the observation &quot;name&quot;. This should be coded using [LOINC](https://www.medplum.com/docs/careplans/loinc) codes per US core guidelines.

To record the actual _value_ of a measurement, you can use one of the various value fields on the `Observation` resource. There are fields for `valueQuantity`, `valueString`, `valueBoolean` and more. To see all of the available fields on the `Observation` resource, see the [`Observation` resource reference](docs/api/fhir/resources/observation).

<details><summary>Examples</summary>

```json
// A basic reading of body temperature
{
  "resourceType": "Observation",
  "id": "example-observation-1",
  "code": {
    "system": "http://loinc.org",
    "code": "8310-5",
    "display": "Body temperature"
  },
  "valueQuantity": {
    "value": 98.2,
    "unit": "degrees Fahrenheit",
    "system": "http://unitsofmeasure.org/",
    "code": "[degF]"
  },
  "status": "final"
}

// An observation generated from a survey response
{
  "resourceType": "Observation",
  "id": "example-observation-2",
  "code": {
    "system": "http://loinc.org",
    "code": "29463-7",
    "display": "Body weight"
  },
  "valueQuantity": {
    "value": 165,
    "unit": "pounds",
    "system": "http://unitsofmeasure.org/",
    "code": "[lb_av]"
  },
  "status": "preliminary",
  // A representation of how the measurement was made, in this case through a survey
  "method": {
    "system": "http://example-practice.org/",
    "code": "entry-survey",
    "display": "entry survey"
  }
}

// An observation generated by a device
{
  "resourceType": "Observation",
  "id": "example-observation-3",
  "code": {
    "system": "http://loinc.org",
    "code": "8480-6",
    "display": "Systolic blood pressure"
  },
  "valueQuantity": {
    "value": 100,
    "unit": "mmhG",
    "system": "http://unitsomeasure.org",
    "code": "mm[Hg]"
  },
  "status": "preliminary",
  // The device that measured the observation, in this case
  "device": {
    "resource": {
      "resourceType": "Device",
      "id": "example-device",
    }
  }
}

// An observation performed by the patient themselves
{
  "resourceType": "Observation",
  "id": "example-observation-4",
  "code": {
    "system": "http://loinc.org",
    "code": "8867-4",
    "display": "Heart rate"
  },
  "valueQuantity": {
    "value": 70,
    "unit": "beats per minute",
    "system": "http://unitsomeasure.org",
    "code": "{Beats}/min"
  },
  "status": "preliminary",
  // This was recorded by the patient, as we can see both the subject and the performer are the patient with the same id
  "subject": {
    "resource": {
      "resourceType": "Patient",
      "id": "example-patient"
    }
  },
  "performer": {
    "resource": {
      "resourceType": "Patient",
      "id": "example-patient"
    }
  }
}
```

</details>

:::tip Note

The `valueQuantity` field is stored as a `Quantity` resource, which contains a `value` field to represent the numerical value and a `unit` field, which is a human readable unit that defines what is measured. Additionally, the unit should be coded using the `code` and `system` fields, similar to a `CodeableConcept`. Whenever possible, the unit should be coded using [Unified Codes for Units of Measure (UCUM)](https://ucum.org/).

:::

## Observation Datatypes

`Observation` resources can be measured in many different ways. To account for this, the `value[x]` fields provide multiple ways to account for different datatypes.

| `value[x]`           | Description                                                                   | Datatype                                                                           |
| -------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| valueQuantity        | Used for numeric measurements with a value and unit.                          | [Quantity](https://www.medplum.com/docs/api/fhir/datatypes/quantity)               |
| valueCodeableConcept | Used when the value is represented by a coded concept (e.g. LOINC or SNOMED). | [CodeableConcept](https://www.medplum.com/docs/api/fhir/datatypes/codeableconcept) |
| valueString          | Used for text values that do not require a specific coding.                   | string                                                                             |
| valueBoolean         | Used for binary observations, where the result is either true or false.       | boolean                                                                            |
| valueInteger         | Used for simple integer values with no units.                                 | number                                                                             |
| valueRange           | Used for observations that have a range as a result.                          | [Range](https://www.medplum.com/docs/api/fhir/datatypes/range)                     |
| valueRatio           | Used to represent ratios between two values as a result.                      | [Ratio](https://www.medplum.com/docs/api/fhir/datatypes/ratio)                     |
| valueSampledData     | Used to represent data that is sampled over a period of time.                 | [SampledData](https://www.medplum.com/docs/api/fhir/datatypes/sampleddata)         |
| valueTime            | Used to represent the exact time an observation was made, without a date.     | string                                                                             |
| valueDateTime        | Used to represent the exact time and date an observation was made.            | string                                                                             |
| valuePeriod          | Used for observations that have a specific duration or period.                | [Period](https://www.medplum.com/docs/api/fhir/datatypes/period)                   |

<details><summary>Examples</summary>

```json

// valueQuantity
{
  "valueQuantity": {
    "value": 177,
    "unit": "centimeters",
    "system": "http://unitsofmeasure.org/",
    "code": "cm"
  }
}

// valueCodeableConcept
{
  "valueCodeableConcept": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "260385009",
        "display": "Negative"
      }
    ]
  }
}

// valueString
{
  "valueString": "Mild pain"
}

// valueBoolean
{
  "valueBoolean": true
}

// valueInteger
{
  // age for example
  "valueInteger": 28
}

// valueRange
{
  // body weight
  "valueRange": {
    "low": {
      "value": 60,
      "unit": "kg",
      "system": "http://unitsofmeasure.org/"
    },
    "high": {
      "value": 90,
      "unit": "kg",
      "system": "http://unitsofmeasure.org/"
    }
  }
}

// valueRatio
{
  // height over weight
  "valueRatio": {
    "numerator": {
      "value": 177,
      "unit": "cm",
      "system": "http://unitsofmeasure.org/"
    },
    "denominator": {
      "value": 72,
      "unit": "kg",
      "system": "http://unitofmeasure.org/"
    }
  }
}

// valueSampledData
{
  // glucose measurements
  "valueSampledData": {
    "origin": {
      "value": 0,
      "unit": "mmol/l"
    },
    "period": 5,
    "factor": 0.5,
    "lowerLimit": 0,
    "upperLimit": 10,
    "dimensions": 1,
  }
}

// valueTime
{
  "valueTime": "14:30:00"
}

// valueDateTime
{
  "valueDateTime": "2023-07-15T14:30:00Z"
}

// valuePeriod
{
  // measurement interval for blood pressure measurements
  "valuePeriod": {
    "start": "2023-07-15T11:30:00Z",
    "end": "2023-07-15T11:45:00Z"
  }
}
```

</details>

## Multi-component Observations

In some cases it is possible for an `Observation` to have multiple "sub-observations". The `Observation.component` field can be used in these cases when there is any supporting result which cannot be reasonably interpreted and used outside the context of the current `Observation`. The `component` element should only be used when there is one method, one observation, one performer, one device, and one time. A classic example of a multi-component `Observation` is systolic and diastolic blood pressure.

<detail><summary>Example</summary>

```json
{
  "resourceType": "Observation",
  "id": "example-component-observation",
  "code": {
    "system": "http://loinc.org",
    "code": "85354-9",
    "display": "Blood pressure panel with all children optional"
  },
  "component": [
    {
      "code": {
        "system": "http://loinc.org",
        "code": "8480-6",
        "display": "Systolic blood pressure"
      },
      "valueQuantity": {
        "value": 100,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org/",
        "code": "mm[Hg]"
      }
    },
    {
      "code": {
        "system": "http://loinc.org",
        "code": "8462-4",
        "display": "Diastolic blood pressure"
      },
      "valueQuantity": {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org/",
        "code": "mm[Hg]"
      }
    }
  ]
}
```

</detail>

:::caution

While creating sub-observations can provide powerful functionality, it can be complex to maintain and operationalize. It is recommended to only use the `component` field when absolutely necessary.

:::

## Reference Ranges

For a more detailed discussion on reference ranges, please see the [`Observation` Reference Ranges docs](https://www.medplum.com/docs/careplans/reference-ranges). However, in this guide, it is important to note that the `Observation.range` field should reference the range from the `ObservationDefinition` that corresponds to what is considered normal for the _specific_ patient, given their age, gender, race, etc.
