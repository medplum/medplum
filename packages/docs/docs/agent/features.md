---
sidebar_position: 2
---

# Agent Features

Each feature that the agent supports, such as the `Agent/$push` operation, `Agent/$status`, `Agent/$reload-config`, etc. all require certain versions of both `Medplum Server` and the `Agent` in order to work. The matrix of feature, `Medplum Server` version, and `Medplum Agent` version looks like this:

| Feature                   | Description                                                                                                                                                           | Medplum Server | Medplum Agent |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- |
| `Prefer: respond-async`   | Allows a header to be passed to tell the server to return a 201 Accepted HTTP response and allow the client to poll for the completion of the `Agent/$push` operation | 3.1.5          | 3.1.5         |
| `Agent/$reload-config`    | Allows for dynamically reloading the config of the `Agent` from `Medplum Server`                                                                                      | 3.1.6          | 3.1.6         |
| `Agent.status`            | Allows using `Agent.status` and `Agent.channel.endpoint.status` to disable an `Agent` or a particular channel via the `Agent` resource                                | 3.1.6          | 3.1.6         |
| Agent `keepAlive` setting | Allows you to tell the agent to keep both incoming and outgoing connections alive                                                                                     | 3.1.9          | 3.1.10        |
| `Agent/$upgrade`          | Allows for remotely upgrading the `Agent` version via FHIR operation                                                                                                  | 3.1.9          | 3.1.10        |

## Major Bug Fixes

| Medplum Version | Agent Version | Description                                                               | Related PR                                           |
| --------------- | ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| 3.2.10          | N/A           | Fixes HL7 ACK messages from bots not making it back to the sending device | [5212](https://github.com/medplum/medplum/pull/5212) |
