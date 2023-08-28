# Capturing Vital Signs

Vital signs are a group of important medical signs that measure the body's most vital (life-sustaining) functions, including blood pressure, pulse rate, respiration rate, and body temperature. Capturing these signs is a common part of many procedures, so it is important to ensure that they are being recorded and stored accurately.

## The `Observation` Resource

Vital signs are stored as [`Observation`](/docs/api/fhir/resources/observation) resources. To track the specific vital that is being observed, use the `Observation.code` element. This describes what was observed, and is sometimes called the observation &quot;name&quot;. This should be coded using [LOINC](https://www.medplum.com/docs/careplans/loinc) codes per US core guidelines.

| **Element**        | **Description**                                                                                                                                                                                                                                              | **Code System**                                                                                     | **Example**                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `status`           | The status of the result value. Indicates if the observation is preliminary or final, if it has been amended/corrected, or if it has an error or been cancelled.                                                                                             | [Observation status types](http://hl7.org/fhir/R4/valueset-observation-status.html)                 | registered                                       |
| `code`             | The type of observation.                                                                                                                                                                                                                                     | [LOINC](https://www.medplum.com/docs/careplans/loinc)                                               | [8867-4](https://loinc.org/8867-4/) – Heart Rate |
| `subject`          | A reference to who/what the observation is about.                                                                                                                                                                                                            |                                                                                                     | Patient/homer-simpson                            |
| `encounter`        | A reference to the `Encounter` or visit during which the observation was made.                                                                                                                                                                               |                                                                                                     | Encounter/example-appointment                    |
| `basedOn`          | A plan or order that that prompted this observation to be made.                                                                                                                                                                                              |                                                                                                     | CarePlan/example-plan                            |
| `performer`        | Who performed the observation and is responsible for its accuracy.                                                                                                                                                                                           |                                                                                                     | Practitioner/dr-alice-smith                      |
| `value[x] `        | The actual result(s) of the observation.                                                                                                                                                                                                                     | [See below](#observation-datatypes)                                                                 |                                                  |
| `dataAbsentReason` | The reason why the result is missing.                                                                                                                                                                                                                        | [Observation data absent reason types](http://hl7.org/fhir/R4/valueset-data-absent-reason.html)     | Asked But Unknown                                |
| `interpretation`   | A categorical assessment of the result. For example, high, low, or normal.                                                                                                                                                                                   | [Observation interpretation types](http://hl7.org/fhir/R4/valueset-observation-interpretation.html) | Normal                                           |
| `device`           | The device used to generate the measurement. This can be medical or non-medical and can range from a simple tongue depressor to an MRI machine. Also includes personal and wearable devices such as smart phones or watches                                  |                                                                                                     | Device/my-apple-watch                            |
| `specimen`         | The specimen from which the observation was derived. A sample of material taken from the patient on which laboratory testing or analysis was performed.                                                                                                      |                                                                                                     | Specimen/finger-prick-blood-sample               |
| `component`        | Some observations have multiple component observations. These component observations are expressed as separate code value pairs that share the same attributes. An example is systolic and diastolic component observations for blood pressure measurements. | [See below](#multi-component-observations)                                                          |                                                  |

To record the actual _value_ of a measurement, you can use one of the various `value` fields on the `Observation` resource. There are fields for `valueQuantity`, `valueString`, `valueBoolean` and more.

<details><summary>Example: basic reading of body temperature</summary>

```js
{
  "resourceType": "Observation",
  "id": "example-observation-1",
  "code": {
    "system": "http://loinc.org",
    "code": "8310-5",
    "display": "Body temperature",
  },
  "valueQuantity": {
    "value": 98.2,
    "unit": "degrees Fahrenheit",
    "system": "http://unitsofmeasure.org/",
    "code": "[degF]",
  },
  "status": "final",
}
```

</details>

<details><summary>Example: an observation generated from a survey resposne</summary>

```js
{
  "resourceType": "Observation",
  "id": "example-observation-2",
  "code": {
    "system": "http://loinc.org",
    "code": "29463-7",
    "display": "Body weight",
  },
  "valueQuantity": {
    "value": 165,
    "unit": "pounds",
    "system": "http://unitsofmeasure.org/",
    "code": "[lb_av]",
  },
  "status": "preliminary",
  // A representation of how the measurement was made, in this case through a survey
  "method": {
    "system": "http://example-practice.org/",
    "code": "entry-survey",
    "display": "entry survey",
  },
}
```

</details>

<details><summary>Example: an observation generated by a device</summary>

```js
{
  "resourceType": "Observation",
  "id": "example-observation-3",
  "code": {
    "system": "http://loinc.org",
    "code": "8480-6",
    "display": "Systolic blood pressure",
  },
  "valueQuantity": {
    "value": 100,
    "unit": "mmhG",
    "system": "http://unitsomeasure.org",
    "code": "mm[Hg]",
  },
  "status": "preliminary",
  // The device that measured the observation, in this case
  "device": {
    "resource": {
      "resourceType": "Device",
      "id": "example-device",
    },
  },
}
```

</details>

<details><summary>Example: an observation performed by the patient</summary>

```js
{
  "resourceType": "Observation",
  "id": "example-observation-4",
  "code": {
    "system": "http://loinc.org",
    "code": "8867-4",
    "display": "Heart rate",
  },
  "valueQuantity": {
    "value": 70,
    "unit": "beats per minute",
    "system": "http://unitsomeasure.org",
    "code": "{Beats}/min",
  },
  "status": "preliminary",
  // This was recorded by the patient, as we can see both the subject and the performer are the patient with the same id
  "subject": {
    "resource": {
      "resourceType": "Patient",
      "id": "example-patient",
    },
  },
  "performer": {
    "resource": {
      "resourceType": "Patient",
      "id": "example-patient"
    },
  },
}
```

</details>

:::tip Note on units

The `valueQuantity` field is stored as a `Quantity` type, which contains a `value` field to represent the numerical value and a `unit` field, which is a human readable unit that defines what is measured. Whenever possible, the unit should be coded using [Unified Codes for Units of Measure (UCUM)](https://ucum.org/).

:::

## Observation Datatypes

`Observation` resources can be measured in many different ways. To account for this, the `value[x]` fields provide multiple ways to account for different datatypes.

| **`value[x]`**         | **Description**                                                               | **Datatype**                                                                       | **Application**                    | **Example**                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `valueQuantity`        | Used for numeric measurements with a value and unit.                          | [Quantity](https://www.medplum.com/docs/api/fhir/datatypes/quantity)               | Height                             | 177 cm                                                                                                                                       |
| `valueCodeableConcept` | Used when the value is represented by a coded concept (e.g. LOINC or SNOMED). | [CodeableConcept](https://www.medplum.com/docs/api/fhir/datatypes/codeableconcept) | HIV test interpretation            | [260385009](https://browser.ihtsdotools.org/?perspective=full&conceptId1=260385009&edition=MAIN/2023-07-31&release=&languages=en) – Negative |
| `valueString`          | Used for text values that do not require a specific coding.                   | string                                                                             | Pain level                         | mild pain                                                                                                                                    |
| `valueBoolean`         | Used for binary observations, where the result is either true or false.       | boolean                                                                            | Vaccination status                 | true                                                                                                                                         |
| `valueInteger`         | Used for simple integer values with no units.                                 | number                                                                             | Age                                | 28                                                                                                                                           |
| `valueRange`           | Used for observations that have a range as a result.                          | [Range](https://www.medplum.com/docs/api/fhir/datatypes/range)                     | Body temperature                   | 98.0 – 98.7                                                                                                                                  |
| `valueRatio`           | Used to represent ratios between two values as a result.                      | [Ratio](https://www.medplum.com/docs/api/fhir/datatypes/ratio)                     | Height over body weight            | 177 cm / 75 kg                                                                                                                               |
| `valueSampledData`     | Used to represent data that is sampled over a period of time.                 | [SampledData](https://www.medplum.com/docs/api/fhir/datatypes/sampleddata)         | Glucose measurement                | 6 mmol/l                                                                                                                                     |
| `valueTime`            | Used to represent the exact time an observation was made, without a date.     | string                                                                             | Time heart rate returned to normal | 15:30:00                                                                                                                                     |
| `valueDateTime`        | Used to represent the exact time and date an observation was made.            | string                                                                             | Birth date and time                | 2023-07-24T13:22:00Z                                                                                                                         |
| `valuePeriod`          | Used for observations that have a specific duration or period.                | [Period](https://www.medplum.com/docs/api/fhir/datatypes/period)                   | Menstrual cycle duration           | 2023-05-12 – 2023-6-09                                                                                                                       |

## Multi-component Observations

In some cases it is possible for an `Observation` to have multiple "sub-observations". The `Observation.component` field can be used in these cases when there are multiple results that cannot be reasonably interpreted individually.

The `component` element should only be used when there is one method, one observation, one performer, one device, and one time.

:::caution

While creating sub-observations can provide powerful functionality, it can be complex to maintain and operationalize. It is recommended to only use the `component` field when absolutely necessary.

:::

A classic example of a multi-component `Observation` is systolic and diastolic blood pressure.

<detail><summary>Example</summary>

```js
{
  "resourceType": "Observation",
  "id": "example-component-observation",
  "code": {
    "system": "http://loinc.org",
    "code": "85354-9",
    "display": "Blood pressure panel with all children optional",
  },
  "component": [
    {
      "code": {
        "system": "http://loinc.org",
        "code": "8480-6",
        "display": "Systolic blood pressure",
      },
      "valueQuantity": {
        "value": 100,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org/",
        "code": "mm[Hg]",
      },
    },
    {
      "code": {
        "system": "http://loinc.org",
        "code": "8462-4",
        "display": "Diastolic blood pressure",
      },
      "valueQuantity": {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org/",
        "code": "mm[Hg]",
      },
    },
  ],
}
```

</detail>

## Reference Ranges

The `Observation.referenceRange` element is a range of values that corresponds to what is considered normal for a _specific_ patient given their age, gender, race, etc.

The set of all possible values for a `referenceRange` is defined in the `ObservationDefinition` resource and is usually set up by clinical administrators. For more details, see the [`Observation` Reference Ranges docs](https://www.medplum.com/docs/careplans/reference-ranges).
