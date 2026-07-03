# CQL

If you've spent any time around healthcare interoperability, you've probably run into **Clinical Quality Language (CQL)**.

CQL powers a surprising number of healthcare standards, including quality measures, clinical decision support, prior authorization, and Documentation Templates & Rules (DTR). Unfortunately, most introductions immediately dive into specifications, grammar, and intermediate representations, leaving many developers wondering what CQL actually looks like.

This article takes the opposite approach. Instead of starting with the specification, we'll start with examples.

By the end, you should have a good intuition for what CQL is and where it fits into the FHIR ecosystem.

## What is CQL?

CQL is a declarative language for asking questions about clinical data.

If SQL asks questions about relational databases, CQL asks questions about FHIR resources.

Typical questions include:

- Is this patient over 18?
- Does the patient have diabetes?
- Has the patient had an HbA1c in the last 90 days?
- What are the patient's active medications?
- Should this questionnaire field be automatically populated?

Most CQL programs aren't hundreds of lines long. They're often just a handful of expressions that compute values or answer yes/no questions.

## Example 1: Hello World

The simplest valid CQL program returns a constant.

```cql
library HelloWorld version '1.0.0'

using FHIR version '4.0.1'

define Greeting:
  'Hello, World!'
```

Evaluating this expression simply returns:

```
Hello, World!
```

Not particularly useful, but it introduces the basic structure:

- A library
- The data model (`using FHIR`)
- One or more `define` expressions

Think of each `define` as a named expression.

## Example 2: Simple Expressions

CQL supports normal arithmetic and expressions.

```cql
library Arithmetic version '1.0.0'

using FHIR version '4.0.1'

define Answer:
  40 + 2
```

Result:

```
42
```

You can also define reusable values.

```cql
define AdultAge:
  18

define RetirementAge:
  AdultAge + 47
```

At this point, CQL doesn't look very different from many expression languages.

## Example 3: Patient Context

Most CQL runs in the context of a single patient.

```cql
context Patient

define IsAdult:
  AgeInYears() >= 18
```

This expression evaluates to either:

```
true
```

or

```
false
```

depending on the current patient.

Notice that we didn't write any code to fetch the patient's birth date. The runtime already knows which patient is being evaluated.

## Example 4: Querying FHIR Resources

Here's where CQL starts to get interesting.

```cql
context Patient

define ActiveMedications:
  [MedicationRequest]
    M where M.status = 'active'
```

If you're familiar with SQL, this should feel familiar.

Roughly speaking, it's equivalent to:

```sql
SELECT *
FROM MedicationRequest
WHERE status = 'active'
```

Except instead of querying database tables, you're querying FHIR resources.

The result is a collection of `MedicationRequest` resources.

## Example 5: Checking for Diabetes

Many clinical rules boil down to simple questions.

```cql
context Patient

define HasDiabetes:
  exists (
    [Condition]
      C where
        C.clinicalStatus.coding.code = 'active'
          and
        C.code.coding.code in {
          '44054006',
          '73211009'
        }
  )
```

This returns:

```
true
```

if the patient has an active diabetes diagnosis.

The `exists()` operator is one of the most common patterns in CQL. Instead of returning a list of matching resources, it simply answers the question, "Did we find at least one?"

## Example 6: Looking for Recent Lab Results

Many quality measures ask questions about events within a time window.

```cql
define HasRecentHbA1c:
  exists (
    [Observation: "HbA1c"]
      O where
        O.effective >= Today() - 90 days
  )
```

This expression asks:

> Has the patient had an HbA1c observation within the past 90 days?

This kind of logic appears throughout quality measures and prior authorization rules.

## Example 7: Finding the Latest Observation

Collections can also be sorted and reduced.

```cql
define LatestWeight:
  Last(
    [Observation: "Body Weight"]
      sort by effective
  )
```

Rather than returning every weight observation, this expression returns the most recent one.

## SQL vs. CQL

If you've used SQL before, much of CQL will feel surprisingly familiar.

| SQL                       | CQL                     |
| ------------------------- | ----------------------- |
| `SELECT * FROM Condition` | `[Condition]`           |
| `WHERE status='active'`   | `where status='active'` |
| `COUNT(*)`                | `Count()`               |
| `EXISTS(...)`             | `exists(...)`           |
| `MAX(date)`               | `Last(sort by date)`    |

The biggest difference is that CQL works with clinical resources instead of relational tables.

## Where You'll Encounter CQL

CQL appears throughout the modern FHIR ecosystem.

### Clinical Quality Measures (eCQMs)

Quality measures ask questions such as:

- Was the patient's blood pressure controlled?
- Did a diabetic patient receive an HbA1c test?
- Was appropriate follow-up performed?

These measures are almost entirely expressed in CQL.

### Clinical Decision Support

Decision support systems use CQL to determine whether recommendations or alerts should be shown to clinicians.

### Prior Authorization (CMS-0057-F)

Under the Da Vinci implementation guides, CQL is used to pre-populate questionnaires and determine which questions should be displayed.

A questionnaire might automatically:

- populate patient demographics,
- determine whether a question should be enabled,
- calculate derived values,
- determine whether additional documentation is required.

## CQL Isn't a General Programming Language

One thing that surprises many developers is what CQL is _not_.

It isn't intended to replace Java, JavaScript, TypeScript, or C#.

There are no HTTP requests.

No user interfaces.

No file I/O.

No web servers.

Instead, CQL focuses on expressing clinical logic in a portable, declarative way.

A CQL engine supplies the patient data. CQL simply describes how to evaluate that data.

## Final Thoughts

At first glance, CQL can seem intimidating because the official specification is comprehensive and introduces concepts like ELM (Expression Logical Model), terminology services, and execution engines.

In practice, most CQL that developers encounter is much simpler.

It's largely a language for filtering FHIR resources, answering clinical questions, and computing values from patient data.

If you're already comfortable with SQL, FHIRPath, or LINQ, you're likely much closer to understanding CQL than you might expect.
