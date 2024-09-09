# E-Prescribe (eRx)

Medplum allows enabling e-prescribe(eRx) functionality. Medplum's e-prescribe functionality is exclusively available to providers directly engaged in patient care as part of [Medplum EHR](/solutions/medplum-ehr).

Visit our [DoseSpot integrations page](/docs/integration/dosespot) to learn more about our DoseSpot integration.

## E-Prescribe FAQ

### Who is qualified to use the eRx feature at Medplum?

The eRx feature at Medplum is available to professionals authorized to prescribe medication in the United States. The feature is user-specific; hence, only approved users can issue prescriptions.

### Is it possible to prescribe controlled substances through Medplum?

No. Currently, Medplum's eRx integration does not allow prescription of controlled substances. If controlled substances are important for your care model, please contact our support team at [support@medplum.com](mailto:support@medplum.com).

### Are there other limits on which medications can be prescribed?

No. Beyond restrictions on controlled substances, prescriber has free choice of medication when prescribing.

### What guidelines exist for prescribing to minors through Medplum?

It is up to the prescriber to ensure dosages are within standard guidelines for for patient's height and weight.

:::danger

E-prescription providers often impose additional validation requirements when prescribing medication for minors. Please check the requirements of your eRx vendor.

:::

### Can prescription cost information be retrieved through the API?

At this time, prescription cost retrieval is not available via the Medplum API. However, Some eRx vendors may display cost information at the time a prescription is written. Check with your specific eRX vendor for more details.

### How does Medplum collect and manage patient insurance details?

It is best practice to maintain update date coverage information for each patient in Medplum, as it is important for both clinical and administrative workflows in the core EHR. See our [Guide on Patient Insurance](/docs/billing/patient-insurance) for more details.

However, many eRx vendors do not allow users to directly input patient coverage details. Rather, they depend on clearinghouses to supply patient coverage data. Check with your eRx vendor for details on how patient coverage is managed.
