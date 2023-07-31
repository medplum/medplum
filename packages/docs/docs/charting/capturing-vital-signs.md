# Capturing Vital Signs

Vital signs are a group of important medical signs that measure the body's most vital (life-sustaining) functions. The four main vital signs are body temperature, pulse rate, respiration rate, and blood pressure; though blood oxygen, weight, and blood glucose level are sometimes included as well.

## Obeservation Resource

Vital signs are stored as [Observation](/docs/api/fhir/resources/observation) resources. To track the specific vital that is being observed, use the `Observation.code` element. This describes what was observed, and is sometimes called the observation &quot;name&quot;. This should be coded using LOINC, SNOMED, OMOP, or a similar custom ontology.

LOINC Systolic Blood Pressure: 8480-6
SNOMED Diastolic Blood Pressure: 271650006

## Who Witnessed an Observation

Observation data can come from various sources, including the practitioner, the patient, a patient&apos;s family member, a nurse, and more. The source of the observation should be recorded on the `Observation.performer` element. This can be important to help provide a degree of confidence in the observation and to inform where any follow-up questions should be directed.

## Medical Devices

Medical devices, which can be represented by either the [Device](/docs/api/fhir/resources/device) or [DeviceDefinition](/docs/api/fhir/resources/devicedefinition) elements are able to provide data regarding patients, tests, etc. A `Device` is an individual instance of a device, whereas `DeviceDefinition` is a kind of device, which can have many instances. In this context, a device is defined as a manufactured item that is used in the provision of healthcare without being substantially changed through that activity.

Devices can cover a wide range of equipment, such as durable or reusable medical equipment, as well as disposable equipment used for diagnostic, treatment, or research. Essentially, a device can range from a tongue depressor all the way to an MRI machine, and the fields in the `Device` resource are flexible enough to cover this range. Additionally, the `Device` element does not necessarily refer to a strictly medical device. This can include wearable devices, such as smart phones or watches.

It is important to note that observations can come from a device, and are represented by the `Observation.device` element.
