## Usage

> **Note that this content is preliminary has not undergone proper review by the appropriate Workgroups.**

An instance of [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) represents the definitional aspects of a kind of observation. This resource is used in a catalog of products or services for healthcare. It provides the definition of observations, which are used as input or produced as outcome of these products and services. The focus of the definitional aspects of [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) is not on the action of performing observations of that kind. Rather, it is on the outcome of the observations. An instance of [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) represents a set of constraints applicable to the value produced by observations of this kind. This set of constraints may have two utilities: 1) It guides the entry of the result of an observation of the kind defined. 2) It helps the consumer of the results of observations of that kind, to interpret properly these results.

For instance, in a catalog of laboratory in vitro diagnostic services, the [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) resources describe the observations that should be provided by the orderer alongside with an ordered service (questions asked at order entry or at specimen collection, prior results) as well as the observations that will be reported once the service has been performed.

In a catalog of medications, [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) resources can be used to describe observations the result thereof need to be checked against the prescription of a particular medicinal product (therapeutic range, units ...)

In the catalog of tests of an in vitro diagnostic device, [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) resources can be used to characterize (absolute range, unit, decimal precision, critical values ...) the observations that will be produced by the IVD tests performed by the device.

[ObservationDefinition](/docs/api/fhir/resources/observationdefinition) may be used to characterize observations from any discipline.

## Relationships

This resource relates to these other resource:.

- Resource [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) is referenced by resource [CatalogEntry](/docs/api/fhir/resources/catalogentry). This enables items of catalogs, representing healthcare services or products, to declare the observations, which are consumed or produced by these items.
- Observation.basedOn references [ObservationDefinition](/docs/api/fhir/resources/observationdefinition) resource.
