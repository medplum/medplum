---
title: Subscription
sidebar_position: 559
---

# Subscription

The subscription resource is used to define a push-based subscription from a server to another system. Once a
subscription is registered with the server, the server checks every resource that is created or updated, and if the
resource matches the given criteria, it sends a message on the defined "channel" so that another system can take an
appropriate action.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| status            | 1..1  | code            | requested \| active \| error \| off                    |
| contact           | 0..\* | ContactPoint    | Contact details for source (e.g. troubleshooting)      |
| end               | 0..1  | instant         | When to automatically delete the subscription          |
| reason            | 1..1  | string          | Description of why this subscription was created       |
| criteria          | 1..1  | string          | Rule for server push                                   |
| error             | 0..1  | string          | Latest error note                                      |
| channel           | 1..1  | BackboneElement | The channel on which to report matches to the criteria |

## Search Parameters

| Name     | Type   | Description                                                    | Expression                    |
| -------- | ------ | -------------------------------------------------------------- | ----------------------------- |
| contact  | token  | Contact details for the subscription                           | Subscription.contact          |
| criteria | string | The search rules used to determine when to send a notification | Subscription.criteria         |
| payload  | token  | The mime-type of the notification payload                      | Subscription.channel.payload  |
| status   | token  | The current state of the subscription                          | Subscription.status           |
| type     | token  | The type of channel for the sent notifications                 | Subscription.channel.type     |
| url      | uri    | The uri that will receive the notifications                    | Subscription.channel.endpoint |
