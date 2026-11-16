For more on implantable devices, refer to [US Core Implantable Device Profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-implantable-device.html).

## Usage

This resource is an administrative resource that tracks individual instances of a device and their location. It is referenced by other resources for recording which device performed an action such as a procedure or an observation, referenced when prescribing and dispensing devices for patient use or for ordering supplies, and used to record and transmit [Unique](https://www.hl7.org/fhir/#udi) [Device](/docs/api/fhir/resources/device) [Identifier](/docs/api/fhir/datatypes/identifier) (UDI) information about a device such as a patient's implant.

## Relationships

These are the device related resources

- Device (this resource)
- [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) - Describes a "kind" of device - not a physical instance, cut a "catalog entry" where a device is defined by the manufacturer, reseller, or regulator.
- [DeviceMetric](/docs/api/fhir/resources/devicemetric) - Describes a measurement, calculation or setting capability of a medical device.

In FHIR, the "Device" is the "administrative" resource for the device (it does not change much and has manufacturer information etc.), whereas the DeviceComponent and [DeviceMetric](/docs/api/fhir/resources/devicemetric) (which is really a kind of DeviceComponent) model the physical part, including operation status and is much more volatile. The physical composition of a [Device](/docs/api/fhir/resources/device) is represented by the [Devices](/docs/api/fhir/resources/device) pointing to their "parent".

[Devices](/docs/api/fhir/resources/device) differ from medications because they are not "used up" - they remain active in a patient in an ongoing fashion. However, the specific boundary between medications and devices is defined at the implementation level and this standard does not enforce a boundary with the exception of devices that are implanted in a patient. The [Medication](/docs/api/fhir/resources/medication) resource should not be used to represent implanted devices.
