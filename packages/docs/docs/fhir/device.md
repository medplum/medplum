---
title: Device
sidebar_position: 211
---

# Device

A type of a manufactured item that is used in the provision of healthcare without being substantially changed through
  that activity. The device may be a medical or non-medical device.

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
| definition | 0..1 | Reference | The reference to the definition for the device
| udiCarrier | 0..* | BackboneElement | Unique Device Identifier (UDI) Barcode string
| status | 0..1 | code | active \| inactive \| entered-in-error \| unknown
| statusReason | 0..* | CodeableConcept | online \| paused \| standby \| offline \| not-ready \| transduc-discon \| hw-discon \| off
| distinctIdentifier | 0..1 | string | The distinct identification string
| manufacturer | 0..1 | string | Name of device manufacturer
| manufactureDate | 0..1 | dateTime | Date when the device was made
| expirationDate | 0..1 | dateTime | Date and time of expiry of this device (if applicable)
| lotNumber | 0..1 | string | Lot number of manufacture
| serialNumber | 0..1 | string | Serial number assigned by the manufacturer
| deviceName | 0..* | BackboneElement | The name of the device as given by the manufacturer
| modelNumber | 0..1 | string | The model number for the device
| partNumber | 0..1 | string | The part number of the device
| type | 0..1 | CodeableConcept | The kind or type of device
| specialization | 0..* | BackboneElement | The capabilities supported on a  device, the standards to which the device
  conforms for a particular purpose, and used for the communication
| version | 0..* | BackboneElement | The actual design of the device or software version running on the device
| property | 0..* | BackboneElement | The actual configuration settings of a device as it actually operates, e.g., regulation status, time properties
| patient | 0..1 | Reference | Patient to whom Device is affixed
| owner | 0..1 | Reference | Organization responsible for device
| contact | 0..* | ContactPoint | Details for human/organization for support
| location | 0..1 | Reference | Where the device is found
| url | 0..1 | uri | Network address to contact device
| note | 0..* | Annotation | Device notes and comments
| safety | 0..* | CodeableConcept | Safety Characteristics of Device
| parent | 0..1 | Reference | The parent device

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| device-name | string | A server defined search that may match any of the string fields in Device.deviceName or Device.type. | Device.deviceName.name
| identifier | token | Instance id from manufacturer, owner, and others | Device.identifier
| location | reference | A location, where the resource is found | Device.location
| manufacturer | string | The manufacturer of the device | Device.manufacturer
| model | string | The model of the device | Device.modelNumber
| organization | reference | The organization responsible for the device | Device.owner
| patient | reference | Patient information, if the resource is affixed to a person | Device.patient
| status | token | active \| inactive \| entered-in-error \| unknown | Device.status
| type | token | The type of the device | Device.type
| udi-carrier | string | UDI Barcode (RFID or other technology) string in *HRF* format. | Device.udiCarrier.carrierHRF
| udi-di | string | The udi Device Identifier (DI) | Device.udiCarrier.deviceIdentifier
| url | uri | Network address to contact device | Device.url

