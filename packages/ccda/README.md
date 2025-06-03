# Medplum C-CDA Library

This library provides utilities for working with C-CDA (Consolidated Clinical Document Architecture) documents in the context of FHIR (Fast Healthcare Interoperability Resources).

## Overview

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

## FHIR Server Integration

In addition to the core conversion functions, Medplum provides FHIR server operations for seamless C-CDA import and export:

* **`Patient/{id}/$ccda-import`:** Imports a C-CDA document and updates the corresponding patient record.
* **`Patient/{id}/$ccda-export`:** Exports a patient's data as a C-CDA document.

These operations are documented in the Medplum FHIR server documentation.

## Additional Notes

* This library is actively maintained and updated to support the latest versions of FHIR, US Core, and C-CDA standards.
* Contributions and feedback are welcome! Please submit issues or pull requests on GitHub.

**Links:**

* [Medplum FHIR Server Documentation](https://www.medplum.com/docs/api/fhir)
* [FHIR R4 Specification](https://hl7.org/fhir/R4/)
* [US Core Implementation Guide](https://www.hl7.org/fhir/us/core/)
* [USCDI Website](https://www.healthit.gov/isp/united-states-core-data-interoperability-uscdi)
* [International Patient Summary Implementation Guide](https://build.fhir.org/ig/HL7/fhir-ips/)
* [HL7 C-CDA Standard](https://hl7.org/cda/us/ccda/3.0.0/)


## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2025
