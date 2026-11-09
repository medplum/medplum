## Usage

> **Trial-Use Note:** The Orders and [Observations](/docs/api/fhir/resources/observation) workgroups wants to make the balloter aware than observations that require the attachment data types are represented by the [Media](/docs/api/fhir/resources/media) resource instead of [Observation](/docs/api/fhir/resources/observation). There have been several significant changes to the [Media](/docs/api/fhir/resources/media) resource in order to align it with [Observation](/docs/api/fhir/resources/observation) and the workflow [event](https://www.hl7.org/fhir/event.html) pattern including:
>
> 1.  The addition of the [partOf](https://www.hl7.org/fhir/media-definitions.html#Media.partOf) and [issued](https://www.hl7.org/fhir/media-definitions.html#issued) elements.
> 2.  The required `type` was changed an optional [category](https://www.hl7.org/fhir/media-definitions.html#category) and the `subtype` element was renamed to [modality](https://www.hl7.org/fhir/media-definitions.html#modality).
> 3.  Additional reference targets added to the `subject`,`operator`, and `basedOn` elements
> 4.  The additions of several standard [event extensions](https://www.hl7.org/fhir/media-profiles.html#extensions).

The [Media](/docs/api/fhir/resources/media) resource contains photos, videos, and audio recordings. It is used with media acquired or used as part of the healthcare process. Here are some typical usages:

- Photos and videos of diagnostic or care provision procedures for recording purposes
- Images contained in diagnostic reports

## Relationships

This resource captures a specific type of [Observation](/docs/api/fhir/resources/observation) - an [Observation](/docs/api/fhir/resources/observation) whose value is audio, video or image data. This resource is the preferred representation of such forms of information as it exposes the metadata relevant for interpreting the information. However, in some legacy environments, media information may occasionally appear in [Observation](/docs/api/fhir/resources/observation) instead. Systems should be aware of this possibility.

The [Media](/docs/api/fhir/resources/media) resource is able to contain medical images in a DICOM format. These images may also be made accessible through an [ImagingStudy](/docs/api/fhir/resources/imagingstudy) resource, which provides a direct reference to the image to a [WADO-RS server](https://www.hl7.org/fhir/ftp://medical.nema.org/medical/dicom/final/sup161_ft.pdf).

For such images, the WADO-RS framework is a preferred method for representing the images - the WADO-RS service may include rendering the image with annotations and display parameters from an associated DICOM presentation state, for instance.

On the other hand, the media resource allows for a robust transfer of an image across boundaries where the WADO-RS service is not available. For this reason, medical images can also be represented in a [Media](/docs/api/fhir/resources/media) resource, but the [Media](/docs/api/fhir/resources/media).content.url should provide a reference to a source WADO-RS service for the image.
