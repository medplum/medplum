# CodeSystem Lookup

This operation checks whether a code belongs to a given code system, and returns the full information about that code
from the code system.

```
[baseUrl]/CodeSystem/$lookup
[baseUrl]/CodeSystem/[id]/$lookup
```

## Parameters

| Name       | Type     | Description                                               | Required |
| ---------- | -------- | --------------------------------------------------------- | -------- |
| `code`     | `string` | The code to look up.                                      | No       |
| `system`   | `string` | The canonical URL of the code system the code belongs to. | No       |
| `version`  | `string` | The version of the code system to search.                 | No       |
| `coding`   | `Coding` | Look up via full Coding.                                  | No       |
| `property` | `string` | Properties of the coding to return in the response.       | No       |

:::note Required Parameters

Although no single parameter is required by the operation, at least one of the following must be provided:

- Both `code` and `system` parameters (and optionally `version` as well)
- The `coding` parameter

If the operation is invoked on a specific `CodeSystem` instance (i.e. calling `/CodeSystem/[id]/$lookup`),
only `code` or `coding.code` need to be provided.

:::

## Output

The operation returns a `Parameters` resource containing the resolved information for the code.

| Parameter Name | Type                 | Description                                            | Required |
| -------------- | -------------------- | ------------------------------------------------------ | -------- |
| `name`         | `string`             | The full name of the code system                       | Yes      |
| `display`      | `string`             | The display string associated with the code            | Yes      |
| `property`     | `Part[]` (see below) | A property associated with the code by the code system | No       |

Any `property` parameters contain 2-3 nested `part` parameters:

| Parameter Name | Type     | Description                                     | Required |
| -------------- | -------- | ----------------------------------------------- | -------- |
| `code`         | `code`   | The name of the parameter                       | Yes      |
| `value`        | \*       | The value of the property                       | Yes      |
| `description`  | `string` | What the property means, or how to interpret it | No       |

**Request**:

```http
GET /CodeSystem/$lookup?system=http://loinc.org&code=8867-4
```

**Response** (200 OK):

<details open>
<summary>Response JSON</summary>

```js
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "name", "valueString": "LOINC Code System" },
    { "name": "display", "valueString": "Heart rate" },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "LN" },
        { "name": "value", "valueString": "Heart rate:NRat:Pt:XXX:Qn" },
        { "name": "description", "valueString": "LOINC official fully specified name" }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "parent" },
        { "name": "value", "valueCode": "MTHU000084" },
        { "name": "description", "valueString": "A parent code in the Component Hierarchy by System" }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "parent" },
        { "name": "value", "valueCode": "LP415756-8" },
        { "name": "description", "valueString": "A parent code in the Component Hierarchy by System" }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "STATUS" },
        { "name": "value", "valueString": "ACTIVE" },
        {
          "name": "description",
          "valueString": "Status of the term. Within LOINC, codes with STATUS=DEPRECATED are considered inactive. Current values: ACTIVE, TRIAL, DISCOURAGED, and DEPRECATED"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "CLASS" },
        { "name": "value", "valueString": "HRTRATE.ATOM" },
        {
          "name": "description",
          "valueString": "An arbitrary classification of terms for grouping related observations together"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "COMPONENT" },
        { "name": "value", "valueString": "Heart rate" },
        {
          "name": "description",
          "valueString": "First major axis-component or analyte: Analyte Name, Analyte sub-class, Challenge"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "CLASSTYPE" },
        { "name": "value", "valueString": "2" },
        {
          "name": "description",
          "valueString": "1=Laboratory class; 2=Clinical class; 3=Claims attachments; 4=Surveys"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "COMMON_TEST_RANK" },
        { "name": "value", "valueString": "18" },
        {
          "name": "description",
          "valueString": "Ranking of approximately 2000 common tests performed by laboratories in USA."
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "SYSTEM" },
        { "name": "value", "valueString": "XXX" },
        { "name": "description", "valueString": "Fourth major axis-type of specimen or system: System (Sample) Type" }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "PROPERTY" },
        { "name": "value", "valueString": "NRat" },
        {
          "name": "description",
          "valueString": "Second major axis-property observed: Kind of Property (also called kind of quantity)"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "TIME_ASPCT" },
        { "name": "value", "valueString": "Pt" },
        {
          "name": "description",
          "valueString": "Third major axis-timing of the measurement: Time Aspect (Point or moment in time vs. time interval)"
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "SCALE_TYP" },
        { "name": "value", "valueString": "Qn" },
        { "name": "description", "valueString": "Fifth major axis-scale of measurement: Type of Scale" }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "CONSUMER_NAME" },
        { "name": "value", "valueString": "Heart rate" },
        {
          "name": "description",
          "valueString": "An experimental (beta) consumer friendly name for this item. The intent is to provide a test name that health care consumers will recognize."
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "RELATEDNAMES2" },
        {
          "name": "value",
          "valueString": "Count/time; Heart beat; HEART RATE.ATOM; Misc; Miscellaneous; nRate; Number rate; Number Rate = Count/Time; Other; Point in time; Pulse; QNT; Quan; Quant; Quantitative; Random; Spec; To be specified in another part of the message; Unspecified"
        },
        {
          "name": "description",
          "valueString": "This field was introduced in version 2.05. It contains synonyms for each of the parts of the fully specified LOINC name (component, property, time, system, scale, method)."
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "EXAMPLE_UNITS" },
        { "name": "value", "valueString": "beats/min" },
        {
          "name": "description",
          "valueString": "This field is populated with a combination of submitters units and units that people have sent us. Its purpose is to show users representative, but not necessarily recommended, units in which data could be sent for this term."
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "EXAMPLE_UCUM_UNITS" },
        { "name": "value", "valueString": "{beats}/min;{counts/min}" },
        {
          "name": "description",
          "valueString": "The Unified Code for Units of Measure (UCUM) is a code system intended to include all units of measures being contemporarily used in international science, engineering, and business. (www.unitsofmeasure.org) This field contains example units of measures for this term expressed as UCUM units."
        }
      ]
    },
    {
      "name": "property",
      "part": [
        { "name": "code", "valueCode": "AssociatedObservations" },
        { "name": "value", "valueString": "89263-8" },
        {
          "name": "description",
          "valueString": "A multi-valued, semicolon delimited list of LOINC codes that represent optional associated observation(s) for a clinical observation or laboratory test. A LOINC term in this field may represent a single associated observation or panel containing several associated observations."
        }
      ]
    }
  ]
}
```

</details>

### Error Response

If the given code could not be found within the target code system, or any other error occurs, the server will return an
`OperationOutcome` resource containing details about the error.

**Request**:

```http
GET /CodeSystem/$lookup?system=http://loinc.org&code=invalid
```

**Response** (404 Not Found):

```js
{
  "resourceType": "OperationOutcome",
  "id": "not-found",
  "issue": [{ "severity": "error", "code": "not-found", "details": { "text": "Not found" } }],
}
```
