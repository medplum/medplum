# Terminologies and Coded Values

Many FHIR resources use different types of coded values to unambiguously represent different concepts from healthcare
and related domains. These coded values enjoy rich support in FHIR, with both a standardized data format for
representing values in FHIR resources, and a rich set of operations to support their effective use.

The collection of different codes relevant to some domain, and their associated meanings, is called a code system. For
example, [LOINC][loinc] is a code system for laboratory tests, measurements, survey answers, and other types of
observable healthcare data. Code systems are often defined by large, national or international organizations; however,
FHIR makes it simple to leverage the same systems for your own locally-defined code systems as well.

[loinc]: /docs/careplans/loinc

## Representing Coded Values

A base [`code`][fhir-code] contains just the coded value string itself, like this one from LOINC: `8867-4`. Without
additional context, it might be difficult to know what this code refers to. Two different code systems might even use
the same code to mean totally different things. In FHIR, plain `code` values are only used when the code system is
unambiguous from context, like when a field value is required to be drawn from a single code system.

In most cases, FHIR uses [`Coding`][fhir-coding] values to unambiguously represent coded values, e.g.

```js
{
  "system": "http://loinc.org",
  "code": "8867-4",
  "display": "Heart rate"
}
```

When using coded values, it may be desirable to combine multiple different codes for the same logical
concept. For example, this is often used to record equivalent codes from different code systems, or multiple related
codes that together describe a more complete concept. The [`CodeableConcept`][fhir-codeableconcept] data type is how
FHIR represents this grouping, and it is the most common representation of coded values in FHIR resources, e.g.

```js
{
  "coding": [
    {
      "system": "http://loinc.org",
      "code": "8867-4",
      "display": "Heart rate"
    },
    {
      "system": "http://snomed.info/sct",
      "code": "364075005",
      "display": "Heart rate (observable entity)"
    }
  ],
  "text": "Heart rate"
}
```

[fhir-code]: https://www.hl7.org/fhir/r4/datatypes.html#code
[fhir-coding]: /docs/api/fhir/datatypes/coding
[fhir-codeableconcept]: /docs/api/fhir/datatypes/codeableconcept

## Defining and Using Code Systems

The FHIR [`CodeSystem`][fhir-codesystem] resource type is used to define how a code system should be used by the FHIR
server. It is the authoritative source of information about how the codes from the system are defined. As shown above
in the examples, a `CodeSystem` is primarily identified in FHIR by its `url`.

```js
{
  "resourceType": "CodeSystem",
  "url": "http://snomed.info/sct",
  "name": "SNOMEDCT_US",
  "title": "SNOMED CT, US Edition",
  "status": "active",
  "content": "example",
  "concept": [
    {
      "code": "364075005",
      "display": "Heart rate (observable entity)"
    }
    // ...
  ]
}
```

Many large, widely-used code systems have far too many codes to fit inside a single FHIR resource. To make effective use
of them, we often need to define a small subset of the available codes related to some specific use case. A [`ValueSet`][fhir-valueset]
resource specifies a group of codes — from one or more code systems — that relate to a common use case. These codes can
be specified explicitly, or by criteria specific to the code system. Like `CodeSystem` resources, a `ValueSet` is
identified primarily by its `url`.

```js
{
  "resourceType": "ValueSet",
  "url": "http://example.com/ValueSet/vitals",
  "name": "vitals",
  "title": "Vital Signs",
  "status": "active",
  "compose": {
    "include": [
      // Include an explicit list of codes
      {
        "system": "http://loinc.org",
        "concept": [
          { "code": "8310-5", "display": "Body temperature" },
          { "code": "8462-4", "display": "Diastolic blood pressure" },
          { "code": "8480-6", "display": "Systolic blood pressure" },
          { "code": "8867-4", "display": "Heart rate" },
          { "code": "9279-1", "display": "Respiratory rate" }
        ]
      },
      // Includes codes by their relationships or properties within the code system
      {
        "system": "http://snomed.info/sct",
        "filter": [
          {
            "property": "concept",
            "op": "descendent-of",
            "value": "118227000"
          }
        ]
      }
    ]
  }
}
```

[fhir-codesystem]: /docs/api/fhir/resources/codesystem
[fhir-valueset]: /docs/api/fhir/resources/valueset
