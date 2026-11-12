Refer to the [US Core Medication profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-medication.html).

At Medplum, we encourage using [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) rather than `Medication`. For more information, see [Modeling a Formulary](https://www.medplum.com/docs/medications/formulary).

## Usage

Representing medications in the majority of healthcare settings is a matter of identifying an item from a list and then conveying a reference for the item selected either into a patient-related resource or to other applications. Additional information about the medication is frequently provided for human verification, but a full representation of the details of composition and efficacy of the medicine is conveyed by referring to drug dictionaries by means of the codes they define. There are some occasions where it is necessary to identify slightly more detail, such as when dispensing a package containing a particular medication requires identification both of the medicine and the package at once. There are also some occasions (e.g. custom formulations) where the composition of a medicine must be represented. In these cases, the ingredients of the medicine have to be specified together with the amount contained, though the [Medication](/docs/api/fhir/resources/medication) resource does not provide full details.

The [Medication](/docs/api/fhir/resources/medication) resource allows for medications to be characterized by the form of the drug and the ingredient (or ingredients), as well as how it is packaged. The medication will include the ingredient(s) and their strength(s) and the package can include the amount (for example, number of tablets, volume, etc.) that is contained in a particular container (for example, 100 capsules of Amoxicillin 500mg per bottle).

The [Medication](/docs/api/fhir/resources/medication) resource can be used to describe a compounded (aka extemporaneous or magistral) product that is manufactured by the pharmacy at the time of dispensing. In this case there will be multiple ingredients which are typically base chemicals (for example, hydrocortisone powder) and there may be other ingredients that are manufactured products (for example, Glaxal Base).

When a medication includes a package, further details about the composition can be provided. A package has a container (vacuum packed box, jar, etc.) and a list of the products or other packages that are in the package.
