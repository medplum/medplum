---
sidebar_position: 0
---

# Messaging & Communications

FHIR supports messaging workflows through the [Communication](/docs/api/fhir/resources/communication)  resource. This resource allows your system to manage message content and metadata in a format independent of its medium (email, sms, chat,etc.).

These [Communications](/docs/api/fhir/resources/communication) can also be structured to support a variety of use cases, including:
 - [Threaded messages](/docs/communications/organizing-communications)
 - [Asynchronous encounters](/docs/communications/async-encounters)
 -  Omni-channel messaging
 -  Real-time notifications using Websockets


Check out our [Contact Center Demo](https://github.com/medplum/medplum-chat-demo) for an in-depth example of a provider messaging app.

<div style={{textAlign: 'center'}}>
  <iframe width="560" height="315" src="https://www.youtube.com/embed/ZrMKhl6-Co0?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen/>
</div>

## Reference

- [Contact Center Demo](https://github.com/medplum/medplum-chat-demo)
- [Contact Center Video](https://youtu.be/ZrMKhl6-Co0) on Youtube
- [Communications Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acommunications) on Github includes sample data.
