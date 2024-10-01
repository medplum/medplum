---
sidebar_position: 2
---

# Agent Features

Each feature that the Agent supports, such as the `Agent/$push` operation, `Agent/$status`, `Agent/$reload-config`, etc. all require minimum versions of both Medplum Server and Medplum Agent in order to work. The matrix of feature, Medplum Server version, and Medplum Agent version looks like this:

| Feature                   | Description                                                                                                                                                                                                                                                                                                                                                                                         | Medplum Server | Medplum Agent |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- |
| `Prefer: respond-async`   | Allows asynchronous calls to `Agent/$push` via the `Prefer` header. The header tells the server to return a `202 Accepted` HTTP response and allows the client to poll for the completion of the `Agent/$push` operation asynchronously without keeping the client waiting for an HTTP response. Useful when a response from a target device can take several seconds or even minutes to come back. | > 3.1.5        | > 3.1.5       |
| `Agent/$reload-config`    | Allows for dynamically reloading the config of the `Agent` from Medplum Server via the `Agent/$reload-config` FHIR operation. Useful for pushing changes to an Agent via the `Agent` resource without restarting the Agent service.                                                                                                                                                                 | > 3.1.6        | > 3.1.6       |
| `Agent.status`            | Allows using `Agent.status` and `Agent.channel.endpoint.status` to disable an Agent or a particular channel via the `Agent` resource. Useful for stopping traffic during Agent maintenance or for debugging of particular channels.                                                                                                                                                                 | > 3.1.6        | > 3.1.6       |
| Agent `keepAlive` setting | Allows you to tell the Agent to keep TCP connections alive for both outgoing traffic (via `Agent/$push`) and incoming traffic (via configured Agent channels) by setting the `keepAlive` setting to `true` on the `Agent` resource. Useful when you want to reduce number of connections to the Agent or if a particular device configuration expects the connection not to close.               | > 3.1.9        | > 3.1.10      |
| `Agent/$upgrade`          | Allows for remotely upgrading the Agent version via the `Agent/$upgrade` FHIR operation.                                                                                                                                                                                                                                                                                                            | > 3.1.9        | > 3.1.10      |

## Major Bug Fixes

| Server Version | Agent Version | Description                                                                | Related PR                                           |
| -------------- | ------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| 3.2.10         | N/A           | Fixes HL7 ACK messages from bots not making it back to the sending device. | [5212](https://github.com/medplum/medplum/pull/5212) |

## Compatibility Between Versions

Aside from the features and bug fixes listed above, the majority of the core functionality of the Medplum Agent is broadly compatible across all versions; notably from `3.1.5` onward. This means the `Agent/$push` FHIR operation functions broadly the same across versions and should be compatible on Medplum Server and Medplum Agent versions `> 3.1.5`.

However, it is not advised to run older versions of the Medplum Agent or Medplum Server against each other if possible, and **we recommend to regularly update both Medplum Server and Medplum Agent in tandem.**
