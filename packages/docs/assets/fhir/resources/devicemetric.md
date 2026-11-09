## Usage

The [DeviceMetric](/docs/api/fhir/resources/devicemetric) resource describes mandatory static properties that characterize a direct or derived, quantitative or qualitative biosignal measurement, setting, or calculation produced by a medical device. The [DeviceMetric](/docs/api/fhir/resources/devicemetric) resource can also be used to describe the non-static but highly relevant properties to the metric such as metric status, metric last calibration time and type, measurement mode, color, reference link to the parent DeviceComponent to where it belongs, and any capabilities that the metric offers (for example: setting the metric label).

Note:

For the initial scope, this [DeviceMetric](/docs/api/fhir/resources/devicemetric) resource is only applicable to describe a single metric node in the containment tree that is produced by the context scanner in any medical device that implements or derives from the ISO/IEEE 11073 standard.

## Relationships

There are two related resources

- [Device](/docs/api/fhir/resources/device) - The physical device that this [DeviceMetric](/docs/api/fhir/resources/devicemetric) belongs to.
