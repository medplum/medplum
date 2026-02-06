---
sidebar_position: 31
---

# Refresh Reference Display Strings

The `$refresh-reference-display` operation updates the `Reference.display` strings within a resource to reflect the
current display string for the referenced resource. This is used to update resources when e.g. linked Patient names
are changed.

## Invocation

```
POST [base]/[ResourceType]/[id]/$refresh-reference-display
```

## Input Parameters

The operation does not have any parameters, and can be invoked with an empty POST body.

## Output

The operation returns the updated resource, with all references within populated with the current display string.

## Example

### Request

```http
POST /fhir/R4/Observation/[id]/$refresh-reference-display
```
