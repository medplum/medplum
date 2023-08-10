# Capturing Vital Signs

Vital signs are a group of important medical signs that measure the body's most vital (life-sustaining) functions. The four main vital signs are body temperature, pulse rate, respiration rate, and blood pressure. However, sometimes other measures, such as blood oxygen, weight, and blood glucose level, are included as well.

## The `Obeservation` Resource

Vital signs are stored as [`Observation`](/docs/api/fhir/resources/observation) resources. To track the specific vital that is being observed, use the `Observation.code` element. This describes what was observed, and is sometimes called the observation &quot;name&quot;. This should be coded using [LOINC](https://loinc.org/search) codes per US core guidelines.

To record the actual value of a measurement, you can use one of the various value fields on the `Observation` resource. There are fields for `valueQuantity`, `valueString`, `valueBoolean` and more. To see all of the available fields on the `Observation` resource, see the [`Observation` resource reference](docs/api/fhir/resources/observation).

**Example: **

```ts

{
  resourceType: 'Observation',
  id: 'example-observation-1',
  // ...
  code: {
    system: 'http://loinc.org',
    code: '8310-5',
    display: 'Body temperature'
  },
  valueQuantity: {
    value: 98.2,
    unit: 'degrees fahrenheit'
  }
}

```

In this example, we use the `code` field to define the vital we are measuring, in this case body temperature. We define it using a LOINC code, as well as a `display`, which is a readable representation of what we are measuring. In addition, since we are measuring temperature, which is easily represented as a number or quantity, we use the `valueQuantity` field to define the measurement result. We can use the `unit` field to provide a readable string of the unit of the measurement.

## Who Performed the `Observation`

Observation data can come from various sources, including the practitioner, a nurse, being self-reported by the patient, or many others. The source of the observation should be recorded on the `Observation.performer` element. This can be important to help provide a degree of confidence in the observation and to inform where any follow-up questions should be directed.

## Medical Devices

Medical devices, which can be represented by either the [`Device`](/docs/api/fhir/resources/device) or [`DeviceDefinition`](/docs/api/fhir/resources/devicedefinition) resources are able to provide data regarding patients, tests, etc. A `Device` is an individual instance of a device, whereas `DeviceDefinition` is a kind of device, which can have many instances. In this context, a device is defined as a manufactured item that is used in the provision of healthcare without being substantially changed through that activity.

Devices can cover a wide range of equipment, such as durable or reusable medical equipment, as well as disposable equipment used for diagnostic, treatment, or research. Essentially, a device can range from a tongue depressor all the way to an MRI machine, and the fields in the `Device` resource are flexible enough to cover this range. Additionally, the `Device` resource does not necessarily refer to a strictly medical device. This can include wearable devices, such as smart phones or watches.

It is important to note that an `Observation` can come from a device, and are represented by the `Observation.device` element. This element should reference a `Device` or a `DeviceMetric` resource from which the `Observation` resulted. For example, if a heart rate measurement is taken from a patient's watch, the resulting `Observation` should reference that watch.

**Example: **

```ts

// A patient's watch that provides a measurement of their heart rate
{
  resourceType: 'Device',
  id: 'example-watch',
  /// ...
}

// The observation resulting from the watch
{
  resourceType: 'Observation',
  id: 'example-observation-2',
  // ...
  code: {
    system: 'http://loinc.org',
    code: '8867-4',
    display: 'Heart rate'
  },
  valueQuantity: {
    value: 67,
    unit: 'beats per minute'
  }
  // The device is a reference to the above watch
  device: {
    resource: {
      resourceType: 'Device',
      id: 'example-watch'
    }
  }
}
```

## Reference Ranges

When capturing vital signs, it is important to classify a reference range that describes a "normal" measurement. This can be done using the `ObservationDefinition` resource. Like the `DeviceDefintiion`, this resource defines a type of `Observation`, whereas the `Observation` resource represents an instance of the resource, or, in this case, an actual measurement of a vital sign.

To capture the range of a measurement, you can use the `range` field on an `ObservationDefinition` resource. This field allows you to define and low and high value, within which would be considered normal. Using the `Observation.interpretation` element, you can then record if the measurement was within the range, low, or high.

**Example: **

```ts

// An observation definition of systolic blood pressure, representing a normal range
{
  resourceType: 'ObservationDefinition',
  id: 'example-definition',
  code: {
    system: 'http://loinc.org',
    code: '8480-6',
    display: 'Systolic blood pressure'
  },
  // ...
  range: {
    low: {
      quantity: 80,
      unit: 'mmHg'
    },
    high: {
      quantity: 120,
      unit: 'mmHg'
    }
  }
},

// An blood pressure observation, that is below the normal range
{
  resourceType: 'Observation',
  id: 'example-observation-3',
  code: {
    system: 'http://loinc.org',
    code: '8480-6',
    display: 'Systolic blood pressure'
  },
  valueQuantity: {
    quantity: 70,
    unit: 'mmHg'
  }
  // ...
  interpretation: [
    {
      system: 'http://example-hospital.org',
      code: 'low',
      display: 'Low blood pressure'
    }
  ]
}

```
