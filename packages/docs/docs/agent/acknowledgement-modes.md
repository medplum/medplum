---
sidebar_position: 20
---

# Acknowledgement Modes

HL7 Acknowledgement Modes define the handshaking protocol between systems exchanging messages over protocols like MLLP. The **Medplum Agent** supports both **Original** and **Enhanced** modes, allowing you to configure connections for optimal throughput and reliability.

Support for Enhanced Acknowledgement Mode was added in **Medplum Server version 3.1.9** and **Medplum Agent version 4.1.8**.

## Overview of HL7 Acknowledgements (ACKs)

HL7 (Health Level Seven) is the standard used for exchanging clinical and administrative data. When a system (the **Sender**) transmits an HL7 message to another system (the **Receiver**), the Receiver is required to send back an **Acknowledgement (ACK)** message to confirm the transaction status.

### The Purpose of Acknowledgements

Acknowledgements are essential for reliable messaging. They serve to:

1. **Confirm Delivery:** Verify that the message was received by the destination system.
2. **Communicate Errors:** Notify the Sender immediately if a structural or application-level problem occurs.
3. **Ensure Data Integrity:** Provide explicit confirmation (success or failure) to the Sender, allowing them to decide whether to retry the transmission and preventing data loss or duplication.

The acknowledgement status is communicated within the **MSA** (Message Acknowledgment) segment.

| Code (Table 0008\) | Meaning            | Description                                                                                                  |
| :----------------- | :----------------- | :----------------------------------------------------------------------------------------------------------- |
| **AA**             | Application Accept | Receiving application successfully processed the message.                                                    |
| **AE**             | Application Error  | Receiving application found an error in processing the message.                                              |
| **AR**             | Application Reject | Receiving application failed to process message for a non-content reason (e.g., security or sequence issue). |

## Original Acknowledgement Mode

Original Mode is the traditional, single-step confirmation process. It is the default protocol for HL7 communication and is often referred to as a "Receive" ACK.

### How Original Mode Works

In Original Mode, the Sender transmits a message and must **block** (wait) on that connection until it receives a single **Application Acknowledgement (AA, AE, or AR)** from the Receiver.

1. **Sender** transmits Message A.
2. **Receiver** takes Message A and runs it through its entire processing pipeline (validation, database commits, complex business logic).
3. **Receiver** sends a single Application ACK (AA/AE/AR).
4. **Sender** receives the ACK and then transmits Message B.

### The Bottleneck

This single-step, blocking approach makes the connection inherently **single-threaded** and inefficient for high-volume data streams. The connection is locked while the receiving application performs the slow, heavy work of processing. This often limits message throughput to low rates, typically **3-4 messages per second (msg/sec)**.

## Enhanced Acknowledgement Mode (Fast ACK)

**Enhanced Acknowledgement Mode**, sometimes called **Fast ACK**, resolves the performance limitations of Original Mode by separating the delivery confirmation from the application processing result. This mode requires the exchange of **two separate acknowledgements**.

### How Enhanced Mode Works (Two-Step Process)

#### Step 1: Accept Acknowledgement (The Fast Response)

Immediately upon receipt, the receiving system (or Medplum Agent) performs quick structural checks and **commits the message to safe, durable storage** (like a queue or database). It then sends a commitment confirmation back to the Sender.

This step is designed to be extremely fast, quickly unblocking the connection.

| Code (v3 AcknowledgementType) | Meaning       | Description                                                                                                    |
| :---------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------- |
| **CA**                        | Commit Accept | Receiving system/handling service accepts responsibility for the message and has committed it to safe storage. |
| **CE**                        | Commit Error  | Receiving system cannot accept the message for a structural/system reason (e.g., sequence error).              |
| **CR**                        | Commit Reject | Receiving system rejects message due to incompatibility (e.g., version mismatch).                              |

#### Step 2: Application Acknowledgement (The Processing Result)

Once the Accept ACK (**CA**) is sent, the MLLP connection is free to immediately receive the next message. The actual message processing (the slow business logic) happens **asynchronously** in the background. After the message has been fully processed by the target application, the final **Application Acknowledgement (AA/AE/AR)** is generated and sent back to the Sender.

### Performance

By unblocking the connection after the quick **CA** response, the Enhanced Mode achieves significantly higher throughput. Implementations using Enhanced Mode with the Medplum Agent have demonstrated performance improvements, moving from single-digit rates to over **300-400 messages per second** in high-volume production environments.

### MSH Configuration for Enhanced Mode

The choice of acknowledgement mode is negotiated using two fields in the MSH segment of the HL7 message:

- **MSH-15 (Accept Acknowledgment Type):** Dictates when the Sender expects the _Accept ACK_ (CA/CE/CR).
- **MSH-16 (Application Acknowledgment Type):** Dictates when the Sender expects the _Application ACK_ (AA/AE/AR).

Common values for these fields include:

| Value  | Condition                                                                |
| :----- | :----------------------------------------------------------------------- |
| **AL** | **Always:** Send the ACK regardless of success or failure.               |
| **NE** | **Never:** The Sender does not require this type of ACK.                 |
| **ER** | **Error:** Only send the ACK if an error occurs.                         |
| **SU** | **Success:** Only send the ACK if the message is processed successfully. |

### Compatibility Caution

Enhanced Mode is not universally supported across all legacy HL7 systems. It is vital to confirm with the external system vendor (the Sender or the Receiver) that they explicitly support the two-step handshaking process before configuring the Medplum Agent to use Enhanced Acknowledgement Mode.
