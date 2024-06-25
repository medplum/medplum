---
id: convert-to-fhir
toc_max_heading_level: 3
sidebar_position: 3
---

# Converting Data to FHIR
[patient]: /docs/api/fhir/resources/patient
[codeableconcept]: /docs/fhir-basics#standardizing-data-codeable-concepts
[condition]: /docs/api/fhir/resources/condition


When migrating data from a 3rd party system to Medplum, a crucial step is converting your existing data into FHIR-compliant resources. This section will guide you through the process of reshaping your data elements, adding identifiers, dealing with codeable concepts, and linking data using conditional references.

## Reshaping Data Elements from the Source

When converting your data to FHIR resources, you'll need to map your existing data elements to the appropriate FHIR resource fields. This process involves:

1. Identifying the corresponding FHIR resource type for each data entity in your source system.
2. Mapping individual data fields to FHIR resource attributes.
3. Transforming data formats to match FHIR requirements (e.g., date formats, name structures).

Here's a simple example of how you might map fields from a source system to FHIR:

Source System (Patient table):
```
| id   | first_name | last_name | dob        | gender |
| ---- | ---------- | --------- | ---------- | ------ |
| P001 | John       | Doe       | 1980-05-15 | M      |
```

FHIR ['Patient'](patient) Resource:
```js
{
  "resourceType": "Patient",
  "name": [
    {
      "given": ["John"],
      "family": "Doe"
    }
  ],
  "birthDate": "1980-05-15",
  "gender": "male"
}
```

## Using FHIR Identifiers to link to the Source System

To maintain traceability and link back to your source system, it's crucial to add the primary keys from your source system as [identifiers](docs/fhir-basics#naming-data-identifiers) in Medplum.

Adding source system identifiers helps in:
- Tracking the origin of each resource
- Facilitating data reconciliation and auditing
- Allow for idempotent updates within Medplum

#### Example

```js
{
  "resourceType": "Patient",
  "identifier": [
    {
      "system": "http://your-source-system.com/patientId",
      "value": "P001"
    }
  ],
  // ... other patient data
}
```

## Dealing with CodeableConcepts

As mentioned in [FHIR Basics](codeableconcept), annotating your data with standardized codes is a crucial for interoperability with the rest of the healthcare ecosystem, and when converting your data to FHIR, you'll find that many of your target elements have the type [CodeableConcept](codeableconcept).

It's great if your source data is already annotated with standard codes. Even if this isn't the case, you can:

1. Add a [local code](/docs/terminology/local-codes) representing your internal coding scheme
2. Enrich your data with standard codes in a separate process

#### Example

Let's look at an example of converting condition data to a FHIR Condition resource. First, we'll show what the existing data might look like in a tabular form:

`Conditions` Table:
```
| condition_id | condition_name |
| ------------ | -------------- |
| HT001        | Hypertension   |
| DM002        | Diabetes       |
```

`Patient_Conditions` Table:
```
| patient_condition_id | patient_id | condition_id |
| -------------------- | ---------- | ------------ |
| PC001                | P001       | HT001        |
| PC002                | P001       | DM002        |
| PC003                | P002       | HT001        |
```

Now, let's convert this data to a FHIR Condition resource:

Initially, with just the local code:

```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC001"
    }
  ],
  "subject": {
    "reference": "Patient/????"
  },
  "code": {
    "coding": [
      {
        "system": "http://your-source-system.com/conditions",
        "code": "HT001",
        "display": "Hypertension"
      }
    ],
    "text": "Hypertension"
  }
}
```

Later, enriched with a standard ICD-10 code:

```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC001"
    }
  ],
  "subject": {
    "reference": "Patient/????"
  },
  "code": {
    "coding": [
      {
        "system": "http://your-source-system.com/conditions",
        "code": "HT001",
        "display": "Hypertension"
      },
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "I10",
        "display": "Essential (primary) hypertension"
      }
    ],
    "text": "Hypertension"
  }
}
```

In this example:

1. We start with local codes from the source system, which allows us to maintain traceability back to the original data.
2. We later augment the data with a standard ICD-10 code. This improves interoperability with other systems that understand ICD-10 codes.
3. The `text` field provides a human-readable description of the condition.

When implementing this in your migration pipeline:

* Map your local codes to FHIR [`Condition`](condition) resources, using the `patient_condition_id` as an identifier.
* Create a separate, offline process to map your local condition codes to standard codes (like ICD-10).
* Update the [`Condition`](condition) resources with the standard codes, either during the initial migration if the mapping is available, or as a separate step later.

The use of the `patient_condition_id` as an identifier provides a clear link back to the original data, which can be valuable for auditing, troubleshooting, or further data reconciliation.

This approach allows you to migrate your data quickly while still maintaining the ability to add standardized coding later, improving the overall quality and interoperability of your data over time.

## Linking Data Using Conditional References

When migrating data to FHIR, it's crucial to maintain relationships between resources. Conditional references are particularly helpful in this process.

During migration, it's often challenging to know the [unique `id`](/docs/fhir-basics#storing-data-resources) that Medplum will assign to a resource once it's created.

Conditional references solve these issues by allowing you to reference resources based on their identifying information from the source system, rather than relying on Medplum-generated IDs.

#### Example
Let's amend the previous example to use a conditional reference to link our [`Condition`](condition) to the [`Patient`](patient).

```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC001"
    }
  ],
  // highlight-start
  "subject": {
    "reference": "Patient?identifier=http://your-source-system.com/patients|P001"
  },
  // highlight-end
  // ...
}
```
With this modification, we no longer have to look up the [`Patient's`](patient) `id` value in Medplum before writing the [`Condition`](condition). The server will automatically resolve the query string `identifier=http://your-source-system.com/patients|P001` into concrete patient id during the write.

You can read more about conditional references [here].

## An End-to-End Example

Let's look at a complete example that demonstrates converting tabular data into FHIR resources, including patients and conditions, using local codes, standard codes, and conditional references.

#### Source Data

First, let's look at our source data in tabular form:

Patients Table:
```
| patient_id | first_name | last_name | birth_date | gender |
| ---------- | ---------- | --------- | ---------- | ------ |
| P001       | John       | Doe       | 1980-07-15 | M      |
| P002       | Jane       | Smith     | 1992-11-30 | F      |
```

Conditions Table:
```
| condition_id | condition_name | icd10_code |
| ------------ | -------------- | ---------- |
| HT001        | Hypertension   | I10        |
| DM002        | Diabetes       | E11        |
```

Patient_Conditions Table:
```
| patient_condition_id | patient_id | condition_id | onset_date |
| -------------------- | ---------- | ------------ | ---------- |
| PC001                | P001       | HT001        | 2022-03-15 |
| PC002                | P001       | DM002        | 2023-01-10 |
| PC003                | P002       | HT001        | 2023-02-22 |
```

#### Resulting FHIR Resources

Now, let's look at how this data would be represented as FHIR resources:

##### Patient Resources

For John Doe (`P001`):
```js
{
  "resourceType": "Patient",
  "identifier": [
    {
      "system": "http://your-source-system.com/patients",
      "value": "P001"
    }
  ],
  "name": [
    {
      "given": ["John"],
      "family": "Doe"
    }
  ],
  "birthDate": "1980-07-15",
  "gender": "male"
}
```

For Jane Smith (`P002`):
```js
{
  "resourceType": "Patient",
  "identifier": [
    {
      "system": "http://your-source-system.com/patients",
      "value": "P002"
    }
  ],
  "name": [
    {
      "given": ["Jane"],
      "family": "Smith"
    }
  ],
  "birthDate": "1992-11-30",
  "gender": "female"
}
```

##### Condition Resources:

For John Doe's Hypertension (`PC001`):
```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC001"
    }
  ],
  "subject": {
    "reference": "Patient?identifier=http://your-source-system.com/patients|P001"
  },
  "code": {
    "coding": [
      {
        "system": "http://your-source-system.com/conditions",
        "code": "HT001",
        "display": "Hypertension"
      },
      // Can be added post-migration
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "I10",
        "display": "Essential (primary) hypertension"
      }
    ],
    "text": "Hypertension"
  },
  "onsetDateTime": "2022-03-15"
}
```

For John Doe's Diabetes (`PC002`):
```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC002"
    }
  ],
  "subject": {
    "reference": "Patient?identifier=http://your-source-system.com/patients|P001"
  },
  "code": {
    "coding": [
      {
        "system": "http://your-source-system.com/conditions",
        "code": "DM002",
        "display": "Diabetes"
      },
      // Can be added post-migration
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "E11",
        "display": "Type 2 diabetes mellitus"
      }
    ],
    "text": "Diabetes"
  },
  "onsetDateTime": "2023-01-10"
}
```

For Jane Smith's Hypertension (`PC003`):
```js
{
  "resourceType": "Condition",
  "identifier": [
    {
      "system": "http://your-source-system.com/patient_conditions",
      "value": "PC003"
    }
  ],
  "subject": {
    "reference": "Patient?identifier=http://your-source-system.com/patients|P002"
  },
  "code": {
    "coding": [
      {
        "system": "http://your-source-system.com/conditions",
        "code": "HT001",
        "display": "Hypertension"
      },
      // Can be added post-migration
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "I10",
        "display": "Essential (primary) hypertension"
      }
    ],
    "text": "Hypertension"
  },
  "onsetDateTime": "2023-02-22"
}
```

This example demonstrates:

- **Converting tabular data to FHIR resources**: The source data from relational tables is transformed into FHIR-compliant JSON resources.
- **Using identifiers from the source system**: Both Patient and Condition resources include identifiers that link back to the original data.
- **Handling local and standard codes**: The Condition resources include both the local code (`condition_id`) and the ICD-10 code.
- **Using conditional references**: The Condition resources reference the Patient using a conditional reference based on the patient's source system identifier.
- **Maintaining relationships between resources**: The link between patients and their conditions is preserved in the FHIR resources.


By following this pattern, you can extend the migration process to handle more complex data structures and relationships while maintaining the integrity and traceability of your source data.

Next, we'll talk about how to **integrate this conversion code into data migration pipelines.**