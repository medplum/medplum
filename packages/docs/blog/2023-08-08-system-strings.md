---
slug: demystifying-fhir-systems
title: Demystifying FHIR Systems
authors:
  name: Rahul Agarwal
  title: Medplum Core Team
  url: https://github.com/rahul1
  image_url: https://github.com/rahul1.png
tags: [fhir-datastore]
---

import CodeBlock from '@theme/CodeBlock'

One of the main sources of confusion when starting an implementation is with FHIR system strings.

This field is ubiquitous across FHIR elements, but many developers who are new to healthcare don't understand its purpose or how to set it properly. They are used in even the most basic implementations, and even the [sample data](/docs/tutorials/importing-sample-data) we provide for prototyping has many `system` identifiers.

So today, we're going to delve into `system` strings to understand what they're for and how to use them!

System strings are commonly found on two distinct element types:

- [`Identifiers`](/docs/fhir-basics#naming-data-identifiers)
- [`CodeableConcepts`](/docs/fhir-basics#standardizing-data-codeable-concepts)

## Identifiers

A common occurrence in healthcare is that the same entity (patient, practitioner, device, etc.) is present in many different systems, each assigning their own unique ID. With FHIR, we can neatly keep track of all these unique IDs using the `identifier` field.

To avert any name collisions, each [`Identifier`](/docs/fhir-basics#naming-data-identifiers) has an associated `system` string, which acts as a namespace for the identifier. This namespace is typically an **absolute URL** to ensure its global uniqueness.

Let's look at an example. Say we have two patients, Alice and Bob, who have both visited Hospital 1 and Hospital 2. They have the following medical record numbers:

<table>
    <thead>
        <tr>
            <th>Alice</th>
            <th>Bob</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>
                <table>
                    <tbody>
                        <tr>
                            <td><em>Hospital 1</em></td>
                            <td>12345</td>
                        </tr>
                        <tr>
                            <td><em>Hospital 2</em></td>
                            <td>98760</td>
                        </tr>
                    </tbody>
                </table>
            </td>
            <td>
                <table>
                    <tbody>
                        <tr>
                            <td><em>Hospital 1</em></td>
                            <td>98760</td>
                        </tr>
                        <tr>
                            <td><em>Hospital 2</em></td>
                            <td>12345</td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    </tbody>
</table>

Simply searching for the patient with record number "12345" would cause confusion.

```curl
GET [base]/Patient?identifier=12345
```

The system string is our guiding light here. It allows us to clarify which identifier comes from each hosptial.

<table>
    <thead>
        <tr>
            <th>Alice</th>
            <th>Bob</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>
                <CodeBlock language="js">
{`{
  "resourceType": "Patient",
  "name": [{"given": ["Alice"]}],
  "identifier": [
    // MRN - Hospital 1
    {
      "system": "http://hospital-1.org",
      "value": "12345"
    },
    // MRN - Hospital 2
    {
      "system": "http://hospital-2.org",
      "value": "98760"
    }
  ]
}`}
            	</CodeBlock>
            </td>
            <td>
                <CodeBlock language="js">
            		{`{
  "resourceType": "Patient",
  "name": [{"given": ["Bob"]}],
  "identifier": [
    // MRN - Hospital 1
    {
      "system": "http://hospital-1.org",
      "value": "98760"
    },
    // MRN - Hospital 2
    {
      "system": "http://hospital-2.org",
      "value": "12345"
    }
  ]
}`}
            	</CodeBlock>
            </td>
        </tr>
    </tbody>
</table>

Now if we add the system string to our search, we can do a targeted query for Bob.

```curl
GET [base]/Patient?identifier=http://hospital-2.org|12345
```

See our [search guide](/docs/search/basic-search#token) for more information about searching with `system` strings.

## CodeableConcepts

Healthcare thrives on codes. Labs, medications, billing - they all have alphanumeric code systems. These standardized codes help healthcare actors communicate, reduce ambiguity, and streamline interoperability. You may have heard of some of these codes, like CPT for "procedure codes" or ICD-10 "diagnosis codes".

In an ideal world, there would be one universal code system for any application. But real-life healthcare is more complicated.

Let's take medications as an example. There are at least four common coding systems used to identify medications (for a deeper dive, check out [our guide on medication codes](https://www.medplum.com/docs/medications/medication-codes)).

This is where [`CodeableConcepts`](/docs/fhir-basics#standardizing-data-codeable-concepts) come in handy. They anticipate that the same _concept_ (e.g. drug) might have different _representations_ (aka codes) in different systems.

The example below shows how Tylenol would be represented in [RxNorm](/docs/medications/medication-codes#rxnorm) and [NDC](/docs/medications/medication-codes#ndc). Here, the `system` string lets us know which code system we're using.

```ts
{
  text: 'Tylenol 325 MG Oral Tablet';
  coding: [
    // RxNorm
    {
      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
      code: '209387',
    },
    // NDC
    {
      system: 'http://hl7.org/fhir/sid/ndc',
      code: '50580045850',
    },
  ];
}
```

However, not all [`CodeableConcepts`](/docs/fhir-basics#standardizing-data-codeable-concepts) map to a standard system. For example, assume that you are using the `Communcation.category` field to organize messages based on product lines. Since product lines are specific to _your_ company, there won't be a standard code system available. In these cases, you will develop **in-house**, or **local** , codes.

## Best Practices for System Strings

So now that we understand [`Identifier`](/docs/fhir-basics#naming-data-identifiers) and [`CodeableConcepts`](/docs/fhir-basics#standardizing-data-codeable-concepts) better, we can talk about how to write good `system` strings.

### Identifiers

For `Identifiers`, the strategy is simple: **each system string should correspond 1:1 with the _source_ system**. For instance, a patient ID from a particular hospital should have a system string like https://hospitalname.org/patientId.

### CodeableConcepts

When it comes to `CodeableConcepts`, it gets a bit more complex. **Whenever possible, you should use standardized code systems** to avoid reinventing the wheel and promote good data hygeine. The FHIR community has defined standard `system` strings for these code systems.

Some commonly used code systems:

<table >
<thead>
<tr>
			<th >Domain</th>
			<th >Code System</th>
			<th ><code>system</code> string</th>
		</tr>
</thead>
	<tbody>
    	<tr>
    		<td >Procedure Names. Provider roles.</td>
    		<td ><a href="https://browser.ihtsdotools.org/">SNOMED</a></td>
    		<td ><code>http://snomed.info/sct</code></td>
    	</tr>
    	<tr>
    		<td >Clinical Observations</td>
    		<td ><a href="/docs/careplans/loinc">LOINC</a></td>
    		<td ><code>http://loinc.org</code></td>
    	</tr>
    	<tr>
    		<td rowspan="3">Billing</td>
    		<td ><a href="https://www.ama-assn.org/practice-management/cpt/cpt-overview-and-code-approval#:~:text=CPT%C2%AE%20code%3F-,What%20is%20a%20CPT%C2%AE%20code%3F,reporting%2C%20increase%20accuracy%20and%20efficiency">CPT</a></td>
    		<td ><code>http://www.ama-assn.org/go/cpt</code></td>
    	</tr>
    	<tr>
    		<td ><a href="https://www.cms.gov/medicare/coordination-benefits-recovery-overview/icd-code-lists">ICD-10</a></td>
    		<td ><code>http://hl7.org/fhir/sid/icd-10</code></td>
    	</tr>
    	<tr>
    		<td ><a href="https://www.cms.gov/medicare/coding/medhcpcsgeninfo">HCPCS</a></td>
    		<td ><code>http://terminology.hl7.org/CodeSystem/HCPCS</code></td>
    	</tr>
    	<tr>
    		<td rowspan="2">Medications</td>
    		<td ><a href="/docs/medications/medication-codes#rxnorm">RxNorm</a></td>
    		<td ><code>http://www.nlm.nih.gov/research/umls/rxnorm</code></td>
    	</tr>
    	<tr>
    		<td ><a href="/docs/medications/medication-codes#ndc">NDC</a></td>
    		<td ><code>http://hl7.org/fhir/sid/ndc</code></td>
    	</tr>
    </tbody>

</table>

For local codes, **the system string should reflect the degree of consensus **you want to enforce across your organization.

A system string like https://my-healthcare-company.org/productLine could indicate a company-wide standard for product lines, while https://my-healthcare-company.org/messaging/productLine could refer to a standard specific only used within the messaging function.

## Conclusion

System strings are your go-to tool for successful healthcare data management. By keeping them clean and consistent, you'll save yourself a lot of confusion and time.

## See Also

- [FHIR Basics](/docs/fhir-basics)
- [Medication Codes](/docs/medications/medication-codes)
- [LOINC Codes](/docs/careplans/loinc)
