## Usage

The [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) resource is used to describe the characteristics and capabilities of a medical device.

## Relationships

The [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) resource contains the "catalog" definition of a device - whether that definition is authored by the regulatory entities, or it is a local definition that includes assembled device configurations. The [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) allows defining hierarchical device configurations (devices as part of other devices).

[Device](/docs/api/fhir/resources/device) vs deviceDefinition: The [Device](/docs/api/fhir/resources/device) resource is meant to refer to a physical instance of a device - hence having attributes like lot number, patient, location, which the [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) resource does not have.

## Background and Context

#### [](https://www.hl7.org/fhir/devicedefinition.html#8.15.3.1 'link to here')
