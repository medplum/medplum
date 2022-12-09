---
sidebar_position: 3
---

# Create a patient

This tutorial explains how to create a [Patient](../api/fhir/resources/patient) in the Medplum app.

Open the Medplum app in your browser: https://app.medplum.com/ If you don't have an account yet, see the [Register](./register) page.

Click on the menu button in the top left corner

![Top left menu](/img/hello-world/top-left-menu.png)

Click on "Patients"

![Patients menu item](/img/hello-world/patients-menu-item.png)

Click on "New" in the toolbar

![New Patient button](/img/hello-world/new-patient-button.png)

Let's create a patient with only a few fields. We can always add more later. We will add:

- Name
- Gender
- Date of birth

Scroll down to "Name". Patients in Medplum can have multiple names. Let's add our first name by clicking the "Add" button.

Enter the given name, or "first name", in the "Given" field.

Enter the family name, or "last name", in the "Family" field.

Scroll down to "Gender". Start typing a gender such as "male", "female", or "other". You can use the autocomplete functionality to choose the desired value. The "gender" can be one of the FHIR [Administrative Gender](https://www.hl7.org/fhir/valueset-administrative-gender.html) values.

Scroll down to "Birth Date". Enter a date of birth.

![Patient name](/img/hello-world/patient-name.png)

Scroll to the bottom and click "OK"

![OK Button](/img/hello-world/ok-button.png)

Congrats, you created a patient!

Copy the "ID" field, because we will need it later. Patients often have many identifiers: MRN (medical record number), SSN (social security number), drivers' license, etc. The primary "ID" is a special ID that we will use in the Medplum API.
