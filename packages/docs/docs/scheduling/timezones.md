---
sidebar_label: Time Zones and Timestamps
sidebar_position: 20
---

# Time Zones and Timestamps

Handling time correctly in distributed systems can be surprisingly complex. Differences in time zones, daylight saving time transitions, and system clock configuration can introduce subtle bugs if timestamps are not handled consistently.

Medplum follows established industry practices and the FHIR specification to ensure that timestamps remain unambiguous, interoperable, and predictable across systems.

This document explains how Medplum handles time zones and timestamps.

## Core Principles

Medplum distinguishes between **FHIR resource content** and **server-side time processing**.

### FHIR resource content

Medplum stores raw FHIR JSON. Date and dateTime values provided in a resource are preserved exactly as submitted, as long as they are valid according to the FHIR specification.

For example, if a client submits:

```json
{
  "effectiveDateTime": "2026-03-09T09:00:00-05:00"
}
```

Medplum will store this value exactly as written in the resource JSON.

FHIR date and dateTime values use **ISO 8601-compatible formatting**, which allows either:

- a UTC suffix (`Z`)
- or an explicit time zone offset (`±HH:MM`)

Examples:

```
2026-03-09T14:00:00Z
2026-03-09T09:00:00-05:00
```

Both represent the same instant in time.

### Server-side time processing

For search, sorting, filtering, and other time-based comparisons, Medplum normalizes timestamps internally so that comparisons operate on a consistent representation of the instant in time.

For example, timestamps used for indexing or search may be normalized using database types such as PostgreSQL `timestamp with time zone`. This ensures that comparisons behave correctly regardless of the original offset used when the data was submitted.

This internal normalization does **not modify the stored FHIR resource JSON**.

### System-generated timestamps

Medplum-generated timestamps are always emitted in **UTC**.

Examples include:

- `meta.lastUpdated`
- audit events
- server logs
- bot execution timestamps

These timestamps appear in the following format:

```
2026-03-09T14:00:00Z
```

Using UTC ensures consistent ordering and interoperability across systems and regions.

## Time Zones in FHIR

FHIR represents timestamps using **ISO 8601** date/time formats.

FHIR date/time values may include:

| Format                      | Meaning                |
| --------------------------- | ---------------------- |
| `2026-03-09T14:00:00Z`      | UTC                    |
| `2026-03-09T09:00:00-05:00` | Local time with offset |

FHIR also includes several different temporal data types:

| Type       | Description                                            |
| ---------- | ------------------------------------------------------ |
| `date`     | A calendar date without a time                         |
| `dateTime` | A date and optional time, possibly with offset         |
| `instant`  | A precise moment in time (always includes a time zone) |
| `time`     | A time of day without a date                           |

Because these types represent different concepts, applications should consider how each field is intended to be interpreted.

For example:

- `instant` always represents a precise moment in time
- `date` may represent a local calendar date without any timezone semantics

Medplum preserves the original representation provided in the resource.

## Facility Time Zones

Many healthcare systems operate relative to a **facility time zone**, such as a hospital or clinic location.

FHIR supports representing time zones using the standard extension:

```
http://hl7.org/fhir/StructureDefinition/timezone
```

This extension can be attached to resources such as:

- `Organization`
- `Location`
- `Practitioner`

Applications may use this information when presenting timestamps or interpreting scheduling rules.

## Scheduling and Recurring Events

Some workflows depend on **local wall-clock time**, such as:

- recurring appointments
- clinic operating hours
- schedules such as "every Tuesday at 3 PM"

These cases cannot be represented by a single UTC timestamp.

Instead, applications should store:

- the local time
- the applicable time zone
- the recurrence rule

Medplum scheduling workflows support this model.

## Displaying Local Time

Applications may display timestamps in the appropriate local time zone for the user or facility.

For example:

| UTC                  | US Eastern | US Pacific |
| -------------------- | ---------- | ---------- |
| 2026-03-09T14:00:00Z | 9:00 AM    | 6:00 AM    |

Medplum's React components automatically handle time zone conversion when rendering timestamps.

Applications using other UI frameworks may implement their own display logic.

## Best Practices

When building applications on Medplum:

### Preserve the original FHIR timestamp representation

Medplum will store the value exactly as provided in the resource JSON.

### Use ISO 8601 date/time formats

Example:

```
2026-03-09T14:00:00Z
```

### Normalize timestamps when performing comparisons

Server-side logic should compare timestamps as instants in time rather than relying on local clock values.

### Convert to local time when displaying to users

User interfaces should render timestamps using the most appropriate time zone for the user or facility.

## References

For more detailed background on handling time zones in distributed systems:

- [W3C Time Zone Best Practices](https://www.w3.org/TR/timezone/)
- [API timestamp handling guidance](https://www.moesif.com/blog/technical/timestamp/manage-datetime-timestamp-timezones-in-api/)
- [Discussion of common timestamp pitfalls](https://stackoverflow.com/a/7583604)
