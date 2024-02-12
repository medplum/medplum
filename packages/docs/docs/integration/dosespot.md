# DoseSpot

Medplum has partnered with [DoseSpot](https://www.dosespot.com/), a leader in e-prescription (eRx) technology, to offer prescription ordering services through the Medplum platform.

This collaboration enables healthcare professionals to seamlessly place medication orders using DoseSpot's eRx interface, which Medplum integrates through an embedded iFrame. This approach ensures a secure, safe, and efficient, experience for clinicians, and offers functionality such as:

- Clinician identity proofing
- Drug-drug interactions
- Patient coverage benefits checks

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

### What guidelines exist for prescribing to minors through Medplum? {#prescribing-to-minors}

Surescripts requires e-Prescriptions sent for pediatric patients (defined as ages 18 and younger – up until their 19th birthday) to include a **height and weight**. This is a firm requirement across all prescribers; it was implemented in September of 2021 as part of the Surescripts update to SCRIPT Standard v2017071 which followed NCPDP regulations to maintain compliance.

Client's 18 years old and under are required to have a documented height & weight on file otherwise eRX cannot be accessed. This requirement cannot be bypassed. Please ensure that any pediatric patients have their date of birth documented on their `Patient` resource, as well as update height and weight documented according to the [US Core Guidelines](/docs/fhir-datastore/understanding-uscdi-dataclasses)

### How do "Refill" and "Reorder" differ within Medplum?

A "Refill" refers to authorizing additional quantities of a medication under an existing prescription, is initiated by the pharmacy.

A "Reorder" involves creating a new prescription order for a medication previously prescribed, and is initiated by the prescriber.

### How does one initiate an Electronic Prior Authorization (ePA) with Medplum's eRx service?

When formulary data indicates a need for ePA based on insurance, the clinician can start the process within the eRx interface. This option becomes available after a prescription is marked as pending, accessible through the medication's action menu. Note that this process is independent of the patient's coverage details, which are auto-populated from external sources when available.

### Does Medplum support prescription submissions to pharmacies across all 50 states?

Yes. Medplum utilizes the Surescripts Pharmacy network through our partnership with our eRx provider, DoseSpot, ensuring nationwide coverage.

### Are there limits on a patient's choice of pharmacy?

No. Patients are free to choose any pharmacy within the SureScripts network.

### Why might a pharmacy not appear in Medplum's search?

A pharmacy might not be found due to reasons such as it not being registered within the network Medplum uses, data entry errors, or it being outside the service area of our eRx integration partner.

To verify that a pharmacy exists in the SureScripts database, you can navigate to to https://surescripts.com/network-connections and scroll to the section "Locate E-Prescribing Pharmacies."

### How does Medplum collect and manage patient insurance details?

Patient insurance details within Medplum's eRx system are pulled by DoseSpot from from Surescripts, which matches insurance information based on patient demographics: name, gender, and date of birth.

The SureScripts database covers approximately 95% of U.S. pharmacies. When patients enter information through their pharmacy, their data is uploaded to SureScripts.

It's important to note that insurance information stored directly in Medplum **does not integrate with Surescripts**, nor can it be manually entered into the eRx system.

### What constitutes a transmission error in Medplum's eRx service?

A transmission error occurs when there's a failure in sending a prescription from Medplum's eRx system to a pharmacy, due to issues like incorrect pharmacy details, network problems, or data mismatches.

### Does Medplum offer drug references or educational materials for patients?

The DoseSpot eRx interface, provides access to drug monographs when a prescription is placed. These monographs can be accessed by clicking on the drug name when viewing pending prescriptions.

### Can custom instructions be added to prescription notes in Medplum?

Drop-down fields within the Medplum eRx interface cannot be customized. However, prescribers can use the free text instructions field for adding notes.

Similarly, the patient notes field can not be auto-populated at this time.
