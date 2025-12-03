Alias:   $UCUM = http://unitsofmeasure.org

ValueSet: ConstrainedTimeUnit
Id: constrained-time-unit
Title: "Supported time units for Medplum scheduling"
* $UCUM#min "Minute"
* $UCUM#h "Hour"
* $UCUM#d "Day"
* $UCUM#wk "Week"

Extension: SchedulingParameters
Id: scheduling-parameters
Title: "Scheduling Parameters"
Description: "Used to generate availability in $find operations"
* ^url = "http://medplum.com/fhir/StructureDefinition/scheduling-parameters"
* ^context[0].type = #element
* ^context[0].expression = "Schedule"
* ^context[1].type = #element
* ^context[1].expression = "ActivityDefinition"
* extension contains
    availability 1..* and
    serviceType 0..* and
    bufferBefore 0..1 and
    bufferAfter 0..1 and
    alignmentInterval 0..1 and
    alignmentOffset 0..1 and
    duration 1..1
* extension ^slicing.discriminator.type = #value
* extension ^slicing.discriminator.path = "url"

* extension[availability].value[x] only Timing
* extension[availability].valueTiming.repeat 1..1
* extension[availability].valueTiming.event 0..0

* extension[serviceType].value[x] only Coding
* extension[serviceType].valueCoding.code 1..1

* extension[bufferBefore].value[x] only Duration
* extension[bufferBefore].valueDuration.value 1..1
* extension[bufferBefore].valueDuration.comparator 0..0
* extension[bufferBefore].valueDuration.unit from ConstrainedTimeUnit

* extension[bufferAfter].value[x] only Duration
* extension[bufferAfter].valueDuration.value 1..1
* extension[bufferAfter].valueDuration.comparator 0..0
* extension[bufferAfter].valueDuration.unit from ConstrainedTimeUnit

* extension[alignmentInterval].value[x] only Duration
* extension[alignmentInterval].valueDuration.value 1..1
* extension[alignmentInterval].valueDuration.comparator 0..0
* extension[alignmentInterval].valueDuration.unit from ConstrainedTimeUnit

* extension[alignmentOffset].value[x] only Duration
* extension[alignmentOffset].valueDuration.value 1..1
* extension[alignmentOffset].valueDuration.comparator 0..0
* extension[alignmentOffset].valueDuration.unit from ConstrainedTimeUnit

* extension[duration].value[x] only Duration
* extension[duration].valueDuration.value 1..1
* extension[duration].valueDuration.comparator 0..0
* extension[duration].valueDuration.unit from ConstrainedTimeUnit

