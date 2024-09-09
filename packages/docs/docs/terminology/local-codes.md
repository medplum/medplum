# Local Codes

In addition to widely-used code systems like [LOINC](/docs/careplans/loinc), FHIR makes it possible to define and use
your own codes and terminology.

## Creating a CodeSystem

The full set of available codes is defined using a `CodeSystem` resource, which should contain a canonical `url` by
which to identify the code system. If the total number of codes is relatively small (on the order of hundreds, or
fewer), they can be included directly within the resource. Setting `CodeSystem.content` to `complete` :

```js
{
  "resourceType": "CodeSystem",
  "url": "http://example.com/CodeSystem/local-medications",
  "status": "active",
  "content": "complete",
  "concept": [
    { "code": "AB", "display": "Albuterol" },
    { "code": "AC", "display": "Acetominophen" },
    { "code": "AL", "display": "Alanine" },
    { "code": "AS", "display": "Aspirin" },
    { "code": "AX", "display": "Amoxicillin" },
  ]
}
```

### Hierarchical Terminologies

If codes have a parent-child relationships, where one is a more specific instance of the other, this can be represented
by nesting the codes in the `CodeSystem` definition. The type of hierarchy should be defined, with `is-a` being the
most typical:

```js
{
  "resourceType": "CodeSystem",
  "url": "http://example.com/CodeSystem/local-medications",
  "status": "active",
  "hierarchyMeaning": "is-a",
  "content": "complete",
  "concept": [
    { "code": "AB", "display": "Antibiotics", "concept": [
      { "code": "AX", "display": "Amoxicillin" },
    ] },
    { "code": "AN", "display": "Analgesics", "concept": [
      { "code": "AC", "display": "Acetominophen" },
      { "code": "AS", "display": "Aspirin" },
    ]}
    { "code": "AM", "display": "Amino acids", "concept": [
      { "code": "AL", "display": "Alanine" },
    ]}
  ]
}
```

## Defining ValueSet(s)

In order to make use of the codes, they should be combined into one or more `ValueSet` resources, which define useful
groupings of the codes. In the simplest case, where all codes in the `CodeSystem` should be available, simply
include the entire system:

```js
{
  "resourceType": "ValueSet",
  "url": "http://example.com/ValueSet/medications",
  "status": "active",
  "compose": {
    "include": [
      { "system": "http://example.com/CodeSystem/local-medications" }
    ]
  }
}
```

If the code system includes a hierarchy or other properties, you can use those to define subsets for specific use cases:

```js
{
  "resourceType": "ValueSet",
  "url": "http://example.com/ValueSet/painkillers",
  "status": "active",
  "compose": {
    "include": [
      {
        "system": "http://example.com/CodeSystem/local-medications",
        "filter": [
          // is-a hierarchy uses the special property "concept"
          {
            "property": "concept",
            "op": "is-a",
            "value": "AN"
          }
        ]
      }
    ]
  }
}
```

## Importing Larger Systems

If the number of codes in the code system is too large to fit in a single resource, Medplum server supports a
proprietary [`$import` operation](/docs/api/fhir/operations/codesystem-import) that allows Super Admin users to load
codes and their metadata into the database. Although codes imported this way will not appear in the `CodeSystem`
resource, they are available for use as normal. To use this method, create the `CodeSystem` as normal, but set
`CodeSystem.content` to `not-present`:

```js
{
  "resourceType": "CodeSystem",
  "url": "http://example.com/CodeSystem/everything",
  "status": "active",
  "content": "not-present",
}
```

Subsequently, codes and any metadata properties associated with them can be sent in batches using the operation endpoint.
