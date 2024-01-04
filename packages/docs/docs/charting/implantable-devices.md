---
sidebar_position: 4
---

# Recording Implantable Devices

Capturing a Patient's implanted devices is a core function of an Electronic Health Record system. Requirements for EHR Implantable Device list are described in the [ONC (a)(14) criteria](https://www.healthit.gov/test-method/implantable-device-list).

Implantable device list can be input via multiple methods, for example via **application user interface (UI)**, synchronized via **integration** or written via **API**.

The [USCDI](/docs/fhir-datastore/understanding-uscdi-dataclasses) V2 data standard outlines specific technical requirements, you can see the [profile on HL7.org](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-implantable-device.html).

:::caution

Medplum ONC (a)(14) certification is under development. Contact us at info@medplum.com for more details.

:::

## Device Specific Identifiers

The recording of implantable devices needs to support several use cases. Here's a few examples:

- When giving a treatment or test, implantable devices must be considered for safe and effective care
- In case of a recall, it should be possible to query for affected patients.
- If a patient experiences an adverse event, the clinician should have the details needed to report it.

At minimum, the presence of the device and the coded-representation of the device type must be stored in the EHR.

The EHR also must have the option to collect the following data:

- The Device Identifier ([UDI-DI](https://www.fda.gov/medical-devices/global-unique-device-identification-database-gudid/accessgudid-public))
- A Unique Device Identifier (UDI) numeric or alphanumeric code
  either as the Human Readable Form (HRF) string representation of the barcode
  or the Automatic Identification and Data Capture (AIDC) representation.
- The following parsed Production Identifiers (UDI-PI) from the UDI
- the manufacture date
- the expiration date
- the lot number
- the serial number
- the distinct identifier (i.e., the distinct identification code)

## User Interface

Medplum provides [React components for implantable devices](https://storybook.medplum.com/?path=/story/medplum-resourceform--us-core-implantable-device) that fulfill data collection requirements and can be embedded in your application.

To obtain a list of embedded devices for a given patient in your application, embed a [search control](https://storybook.medplum.com/?path=/story/medplum-searchcontrol--checkboxes) for `Device` resources with for that patient. Documentation for constructing a [search by reference](/docs/search/basic-search#searching-by-reference) is described in the search documentation.

The FHIR Resource that represents the implanted device is a FHIR Device resource. A sample [FHIR Bundle](https://drive.google.com/file/d/1tLJ4qyWNczAvcfhxMA6HyKETdwFlDYjV/view?usp=sharing) is available for download.

## Related Reading

- [ONC (a)(14)](https://www.healthit.gov/test-method/implantable-device-list) official description and guide.
- [Sample device data bundle](https://drive.google.com/file/d/1tLJ4qyWNczAvcfhxMA6HyKETdwFlDYjV/view?usp=sharing) see sample devce data in accordance with USCDI.
- [US Core Implantable Device Profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-implantable-device.html)
- FDA [Global Unique Device Identification Database (GUDID)](https://www.fda.gov/medical-devices/global-unique-device-identification-database-gudid/accessgudid-public)
- [Implantable Device](https://storybook.medplum.com/?path=/story/medplum-resourceform--us-core-implantable-device) react component on Storybook
