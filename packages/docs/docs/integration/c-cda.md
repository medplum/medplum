# C-CDA

Medplum provides support for C-CDA (Consolidated Clinical Document Architecture) handling in accordance with the [ONC Certification](/docs/compliance/onc) criteria (g)(7), (g)(9) and (b)(1) as well as developer utilities for working with C-CDA documents in the context of FHIR.

## Overview

Medplum provides the following functionality for C-CDA handling.

* A C-CDA viewer that allows uploaded documents to be viewed in the Medplum App or in a react component.
* The ability to Export C-CDA in the Medplum app or via API
* An SDK for FHIR to C-CDA conversion.

## C-CDA Viewer 

To access the C-CDA viewer, upload a C-CDA file as a FHIR Binary.  The viewer will render the data for viewing in the application.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/Eg0-mu-UYAQ?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## Export C-CDA

To export patient data as C-CDA, navigate to `https://app.medplum.com/Patient/<PATIENT_ID>/export` in the Medplum App.  There are several options for export, and exporting as C-CDA will create and download the XML file to the desktop.

## Transitions of Care

Medplum enables sending C-CDA to other systems via Direct Message to support transitions of care.  To utilize the feature, implementors need to create a communication resource with the C-CDA attached as shown in the video.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/Ijjtf0ClZDA?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## FHIR Server Integration

In addition to the core conversion functions, Medplum provides FHIR server operations for seamless C-CDA export:

* **`Patient/{id}/$ccda-export`:** Exports a patient's data as a C-CDA document.

This operation is documented in the [Medplum FHIR operations](/docs/api/fhir/operations) documentation.

## Developer Utilities

The `@medplum/ccda` package enables seamless conversion between C-CDA and FHIR, leveraging the International Patient Summary (IPS) format as a bridge. This approach ensures standardized representation of clinical data and facilitates interoperability with various healthcare systems.

**Key Features:**

* **C-CDA to FHIR:** Convert a C-CDA document to a FHIR Composition bundle using the `convertCcdaToFhir` function.
* **FHIR to C-CDA:** Convert a FHIR Composition bundle to a C-CDA document using the `convertFhirToCcda` function.
* **XML Parsing:** Load a C-CDA document from an XML string using the `convertXmlToCcda` function.
* **XML Serialization:** Serialize a C-CDA document to an XML string using the `convertCcdaToXml` function.

## Usage

```typescript
import {
  convertCcdaToFhir,
  convertFhirToCcda,
  convertXmlToCcda,
  convertCcdaToXml,
} from '@medplum/ccda';

// Convert C-CDA to FHIR
const bundle = convertCcdaToFhir(ccda);

// Convert FHIR to C-CDA
const ccda = convertFhirToCcda(bundle);

// Load C-CDA from XML
const ccda = convertXmlToCcda(xml);

// Serialize C-CDA to XML
const xml = convertCcdaToXml(ccda);
```

## Strategy and Alignment

This library is designed to elegantly integrate the following standards and specifications:

* **FHIR R4:** The underlying data model for representing healthcare resources.
* **US Core:**  A set of FHIR profiles and extensions for US healthcare interoperability.
* **USCDI:** The United States Core Data for Interoperability, defining a standardized set of health data classes and elements.
* **International Patient Summary (IPS):** A FHIR-based standard for exchanging patient summaries.
* **HL7 C-CDA:** A widely used standard for clinical document exchange.
* **C-CDA R2.1 for USCDI v3:** A specific implementation of C-CDA aligned with the USCDI v3 standard.

By aligning with these standards, this library ensures that C-CDA documents can be effectively converted to and from FHIR, enabling interoperability with modern healthcare systems and applications.

## Additional Notes

* This library is actively maintained and updated to support the latest versions of FHIR, US Core, and C-CDA standards.

## Related Reading

* [Medplum C-CDA Library](https://github.com/medplum/medplum/tree/main/packages/ccda)
* [Medplum FHIR Server Documentation](https://www.medplum.com/docs/api/fhir)
* [FHIR R4 Specification](https://hl7.org/fhir/R4/)
* [US Core Implementation Guide](https://www.hl7.org/fhir/us/core/)
* [USCDI Website](https://www.healthit.gov/isp/united-states-core-data-interoperability-uscdi)
* [International Patient Summary Implementation Guide](https://build.fhir.org/ig/HL7/fhir-ips/)
* [HL7 C-CDA Standard](https://hl7.org/cda/us/ccda/3.0.0/)


