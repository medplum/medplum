---
title: DeviceDefinition
sidebar_position: 217
---

# DeviceDefinition

The characteristics, operational status and capabilities of a medical-related component of a medical device.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | Instance identifier
| udiDeviceIdentifier | 0..* | BackboneElement | Unique Device Identifier (UDI) Barcode string
| manufacturer[x] | 0..1 | string | Name of device manufacturer
| deviceName | 0..* | BackboneElement | A name given to the device to identify it
| modelNumber | 0..1 | string | The model number for the device
| type | 0..1 | CodeableConcept | What kind of device or device system this is
| specialization | 0..* | BackboneElement | The capabilities supported on a  device, the standards to which the device
  conforms for a particular purpose, and used for the communication
| version | 0..* | string | Available versions
| safety | 0..* | CodeableConcept | Safety characteristics of the device
| shelfLifeStorage | 0..* | ProductShelfLife | Shelf Life and storage information
| physicalCharacteristics | 0..1 | ProdCharacteristic | Dimensions, color etc.
| languageCode | 0..* | CodeableConcept | Language code for the human-readable text strings produced by the device (all supported)
| capability | 0..* | BackboneElement | Device capabilities
| property | 0..* | BackboneElement | The actual configuration settings of a device as it actually operates, e.g., regulation status, time properties
| owner | 0..1 | Reference | Organization responsible for device
| contact | 0..* | ContactPoint | Details for human/organization for support
| url | 0..1 | uri | Network address to contact device
| onlineInformation | 0..1 | uri | Access to on-line information
| note | 0..* | Annotation | Device notes and comments
| quantity | 0..1 | Quantity | The quantity of the device present in the packaging (e.g. the number of devices present
  in a pack, or the number of devices in the same package of the medicinal product)
| parentDevice | 0..1 | Reference | The parent device it can be part of
| material | 0..* | BackboneElement | A substance used to create the material(s) of which the device is made

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | The identifier of the component | DeviceDefinition.identifier
| parent | reference | The parent DeviceDefinition resource | DeviceDefinition.parentDevice
| type | token | The device component type | DeviceDefinition.type

