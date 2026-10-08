# DoseSpot

:::tip[Planning this integration?]
The [E-Prescribe Decision Guide](/docs/decision-guides/e-prescribe) walks through the integration and enrollment decisions behind an e-prescribing build — iframe vs. integrated UI, controlled substances, and prescriber enrollment — use it alongside these docs.
:::

Medplum has partnered with [DoseSpot](https://www.dosespot.com/), a leader in e-prescription (eRx) technology, to offer prescription ordering services for the [Medplum EHR](/solutions/medplum-ehr). Medplum's e-prescribe functionality is exclusively available to providers directly engaged in patient care as part of [Medplum EHR](/solutions/medplum-ehr).

The integration offers functionality such as:

- [Prescriber Enrollment](/docs/integration/dosespot/enroll-user) for automatically setting up your Users in DoseSpot
- [Supervising prescribers](/docs/integration/dosespot/supervising-prescribers) for assigning a Prescribing Clinician to a Prescribing Agent Clinician after enrollment
- [Syncing prescriptions and medication history](/docs/integration/dosespot/getting-started) between DoseSpot and Medplum

Detailed prescribing workflow documentation is available to customers with the DoseSpot integration enabled. Contact [Medplum support](mailto:support@medplum.com) for access.

## DoseSpot FAQ

### Who is qualified to use the eRx feature at Medplum?

The eRx feature at Medplum is available to professionals authorized to prescribe medication in the United States, contingent upon integration with our partner platform, DoseSpot. Approval from DoseSpot is required for access.

The feature is user-specific; hence, only approved users can issue prescriptions. Proxy access can be granted to other team members upon designation.

### Why does DoseSpot request credit card information?

DoseSpot partners with Experian to verify prescribers' identities. This is a one time check that is performed during the prescriber's first prescription in Medplum.

Credit card details may be requested by Medplum's eRx partner for identity verification purposes, to ensure the security and integrity of prescribing privileges within the platform.

This procedure is integral to the DoseSpot's identity proofing protocol. Such identity verification measures are widely adopted to prevent fraud and confirm the authenticity of an individual's identity. To accomplish this, the prescriber's credit card details are cross-referenced with Experian data to ensure a match between the prescriber's provided information and that associated with the credit card and report.

**Importantly, the credit card is neither charged nor stored in Medplum.** Moreover, this process involves a soft credit check, which does not impact the prescriber's credit rating or borrowing capabilities

### What distinguishes a "Proxy" user from a "Prescriber" ?

A "Prescriber" is a user authorized to directly issue prescriptions, holding the necessary credentials and permissions.

A "Proxy" user, however, acts as an assistant or delegate, performing tasks on behalf of a Prescriber but does not have the authority to finalize prescriptions without review and approval by a Prescriber.

### Does Medplum support controlled substances prescriptions?

Yes, Medplum supports Electronic Prescriptions for Controlled Substances (EPCS) through DoseSpot's platform. 

When prescribing controlled substances, additional requirements include:
- An effective date must be specified
- A diagnosis is required for EPCS prescriptions
- Enhanced security measures and identity verification are enforced

### Does Medplum support prescription submissions to pharmacies across all 50 states?

Yes. Medplum Medplum's integration with DoseSpot allows ordering prescriptions to any pharmacy across 50 states.

### How does Medplum collect and manage patient insurance details?

Patient insurance details within Medplum's eRx system are pulled by DoseSpot, which matches insurance information based on patient demographics: name, gender, and date of birth.

It's important to note that insurance information stored directly in Medplum **does not integrate with DoseSpot**, nor can it be manually entered into the eRx system.

### What constitutes a transmission error in Medplum's eRx service?

A transmission error occurs when there's a failure in sending a prescription from Medplum's eRx system to a pharmacy, due to issues like incorrect pharmacy details, network problems, or data mismatches.
