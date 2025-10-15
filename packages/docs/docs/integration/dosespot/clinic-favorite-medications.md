---
sidebar_position: 3
---

# Clinic Favorite Medications

The Medplum-DoseSpot integration allows you to configure **clinic favorite medications** which can significantly **reduce the number of clicks required for clinicians to prescribe common medications**. This allows your organization to:

- Standardize prescribing practices across your clinic to avoid mistakes and excessive clicks
- Reduce prescription time for clinicians to prescribe frequently prescribed medications

## How It Works

When clinicians access the DoseSpot eRx iframe through Medplum, they'll see an option to start with one of your organization's favorite medications displayed when creating a new prescription. This allows them to:

1. **Quickly select** from your organization's favorite medications
2. **Input Prescription Specifics:** Edit any of the default details for the medication, like the strength, patient instructions, or dispense type that might need to be customized for this specific prescription
3. **Save** the prescription

## Setting Up Clinic Favorite Medications

The following step-by-step guide, using the [Medplum Provider App DoseSpot page](https://provider.medplum.com/integrations/dosespot), will walk you through configuring favorite medications in DoseSpot for your organization. 

**1. Use the [Medplum Provider App DoseSpot page](https://provider.medplum.com/integrations/dosespot) to add a new DoseSpot favorite medication.**

![Step 1: Search for a medication](/img/integrations/dosespot/dosespot-fav-med-step-1.png)

**2. Select the medication you want, add your patient directions, and save to your favorites.**

![Step 2: Add a favorite medication](/img/integrations/dosespot/dosespot-fav-med-step-2.png)

**3. The medication will now be available in DoseSpot iframe when creating a new prescription.**

![Step 3: View favorite medications](/img/integrations/dosespot/dosespot-fav-med-step-3.png)

**4. Select the medication from your favorites when creating a new prescription, and fill out any additional details if needed.**

![Step 4: Select a favorite medication](/img/integrations/dosespot/dosespot-fav-med-step-4.png)

This Medplum Provider App DoseSpot page is an **unopinionated example of a favorite medication management page**. The building blocks for it are in the *useDoseSpotClinicFormulary* hook from the [Medplum react hooks](https://github.com/medplum/medplum/tree/main/packages/dosespot-react) package. You can use this hook to build your own favorite medication management page, using your own frontend patterns and components.

The Provider App example implementation can be found [here](https://github.com/medplum/medplum/tree/main/examples/medplum-provider/src/pages/integrations/DoseSpotFavoritesPage.tsx).

:::info
This feature requires your Medplum User to be configured as a DoseSpot `ClinicianAdmin`. Contact [Medplum support](mailto:support@medplum.com) for help with this.
:::


