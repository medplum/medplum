# FHIRcast

Medplum has alpha support for [FHIRcast STU3](https://build.fhir.org/ig/HL7/fhircast-docs/).

## Overview

FHIRcast is a **lightweight, topic-based publish/subscribe protocol** that enables healthcare applications to synchronize context in real-time. Built on HTTP and websockets, it facilitates seamless communication between a "context source" (the application initiating the context change, e.g., an EHR) and "context subscribers" (applications that need to react to that change, e.g., a clinical decision support app).

## Key Concepts

- **Context**: Refers to the current patient, encounter, or other relevant clinical information that needs to be shared between applications.
- **Context Source**: The application that publishes context changes. Typically, this is the primary clinical application, like an Electronic Health Record (EHR) system or Picture Archiving Communication System (PACS).
- **Context Subscriber**: An application that listens for and reacts to context changes published by a source. These can be various SMART on FHIR apps, decision support tools, or other integrated systems.
- **Topic**: A specific channel for context updates, often identified by a UUID. Applications subscribe to topics to receive relevant context changes.
- **Event**: A specific type of context change, such as Patient-open, Patient-close, Encounter-open, or Encounter-close. FHIRcast defines a set of standard events.
- **WebSockets**: FHIRcast primarily uses WebSockets for real-time, bidirectional communication, allowing subscribers to receive updates as they happen.

## How FHIRcast Works

1. **Handshake**: A subscriber initiates a connection with a context source, typically by establishing a websocket connection.
2. **Subscription**: The subscriber expresses interest in specific context topics (e.g., patient context).
3. **Context Change**: When a user in the context source application (e.g., an EHR) changes the active patient, the source publishes a FHIRcast event to the relevant topic.
4. **Notification**: Subscribers to that topic receive the event, which includes the new context (e.g., the Patient FHIR resource, which contains information like the patient's ID, name, date of birth, etc.).
5. **Synchronization**: Upon receiving the event, the subscriber application can then update its own display or internal state to reflect the new context.

## Use Cases

- **EHR to SMART App Integration**: An EHR system publishes Patient-open events, and a SMART on FHIR application automatically loads the newly selected patient's data.
- **Clinical Decision Support**: A CDS application subscribes to Encounter-open events, and when a new encounter is opened, it automatically retrieves relevant patient data to provide real-time recommendations.
- **Multi-Application Workflows**: In a clinic setting, as a clinician moves from patient to patient in one application, other connected applications (e.g., a billing system, a lab order entry system) automatically switch to the same patient context.
- **PACS Synchronization**: A Picture Archiving and Communication System (PACS) can subscribe to patient or encounter context changes, automatically loading the relevant imaging studies when a patient or encounter is selected in another clinical application.
- **Streamlined Radiology Workflows**: As a radiologist creates imaging measurements in a PACS, the PACS creates DiagnosticReport-update events containing ImagingSelection resources, which informs the report creator of the new measurements. As the radiologist is dictating and highlighting relevant measurements in the PACS, the PACS sends DiagnosticReport-select events, letting the report creator know which measurement is being referenced at different parts without any extra input from the radiologist.

## Related Reading

- [Medplum Certifies IRA](/blog/ihe-ira-radiology-reporting)