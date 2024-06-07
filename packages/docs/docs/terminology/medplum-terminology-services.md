# Medplum Terminology Services

Medplum provides a layer of functionality to make working with coded values simple. Some of the most common use cases
are detailed below to show how these components can fit together.

## Binding an input to a set of codes

To restrict the set of values that can be used with an input, it can be bound to a `ValueSet` defining which codes are
allowed. This enables a typeahead UI, where the user can select from a list of available codes, and type part of the
desired concept to filter the list and aid in selection when the set of possible codes is large.

### Defining the ValueSet

First, the `ValueSet` resource must be uploaded to the Medplum FHIR server, and must contain a `url` by which
to reference it.

```js
{
  "resourceType": "ValueSet",
  "url": "http://example.com/ValueSet/vitals",
  "name": "vitals",
  "title": "Vital Signs",
  "status": "active",
  "compose": {
    "include": [
      {
        "system": "http://loinc.org",
        "concept": [
          { "code": "8310-5", "display": "Body temperature" },
          { "code": "8462-4", "display": "Diastolic blood pressure" },
          { "code": "8480-6", "display": "Systolic blood pressure" },
          { "code": "8867-4", "display": "Heart rate" },
          { "code": "9279-1", "display": "Respiratory rate" }
        ]
      }
    ]
  }
}
```

Additionally, the URL used to refer to the code system in `ValueSet.compose.include.system` must actually correspond to
a valid `CodeSystem` resource on the server:

```js
{
  "resourceType": "CodeSystem",
  "url": "http://loinc.org",
  "name": "LOINC",
  "status": "active",
  "content": "example",
  "concept": [
    { "code": "8310-5", "display": "Body temperature" },
    { "code": "8462-4", "display": "Diastolic blood pressure" },
    { "code": "8480-6", "display": "Systolic blood pressure" },
    { "code": "8867-4", "display": "Heart rate" },
    { "code": "9279-1", "display": "Respiratory rate" }
  ]
}
```

#### Finding Existing ValueSet Resources

### Binding to the Input

The `ValueSetAutocomplete` React component provides the basic functionality for connecting an input field with a
`ValueSet` for typeahead.

```jsx
import { ValueSetExpansionContains } from '@medplum/fhirtypes';

<ValueSetAutocomplete
  binding="http://example.com/ValueSet/vitals"
  onChange={(options: ValueSetExpansionContains[]) => {
    console.log(options.map((o) => o.display + ' (' + o.system + '|' + o.code + ')').join('\n'));
  }}
/>
```
