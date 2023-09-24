# Push to Agent

## Introduction

While the Medplum Agent traditionally connected healthcare facilities to cloud services by listening to legacy healthcare protocols and forwarding messages securely to the cloud, it also supports pushing messages from the cloud to on-prem devices.

## Feature Overview

1. **Message Push**: Leverage websockets for a persistent connection between the cloud server and on-prem Medplum Agent.
2. **Cloud-Initiated Messages**: With the existing connection, the server can initiate messages to be sent directly to remote devices via the agent.
3. **Use Cases**:
   - Push order details directly to lab instruments using HL7 or ASTM.
   - Send patient details to radiology modalities using DICOM.
   - Relay a DICOM SR to a RIS using DICOM.
4. **Simplified Infrastructure**: Eliminate the need for site-to-site VPNs, making setups more straightforward and secure.

## How To Use The Feature

1. **Direct Push**:
   - Send an HTTPS POST request to `/Agent/{id}/$push`.
   - Include the message intended for the remote device in the content body.
   - The Medplum server will forward the message through websockets, and the Medplum Agent will relay it to the intended device.
2. **Using MedplumClient**:
   - MedplumClient, Medplum's JavaScript/TypeScript SDK, simplifies tasks related to connectivity and authentication.
   - To send a message, just use: `medplum.pushToAgent(agent, message)`. The SDK manages the HTTPS POST request for you.
3. **Pushing with Medplum Bots**:
   - Medplum Bots allow users to run custom JavaScript or TypeScript logic based on various triggers.
   - Each Bot invocation has a built-in MedplumClient.
   - To push a message, use: `medplum.pushToAgent(agent, message)`.

## End-To-End Example: Pushing Lab Orders

<ol>
  <li><strong>Objective</strong>: Push lab orders to a remote device using HL7.</li>
  <li><strong>Trigger</strong>: "Create" or "Update" operations on a FHIR ServiceRequest.</li>
  <li><strong>Steps</strong>:
    <ol>
      <li>Set up a Medplum Bot.
        <ul>
          <li>The Bot will receive the FHIR ServiceRequest.</li>
          <li>It will then convert the required FHIR fields to HL7 using the Medplum HL7 SDK.</li>
        </ul>
      </li>
      <li>Save and deploy your Bot.</li>
      <li>Create a FHIR Subscription:
        <ul>
          <li>Set the criteria to "ServiceRequest".</li>
          <li>Choose the Bot as the channel target.</li>
        </ul>
      </li>
      <li>Now, any "create" or "update" operation on a FHIR ServiceRequest will trigger the Medplum server to call the Bot. The Bot will process and convert the message to HL7, sending it to the remote device via the Medplum Agent.</li>
   </ol>
  </li>
</ol>
