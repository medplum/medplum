---
sidebar_position: 3
---

# Create a patient

This guide explains how to create a [Patient](../api/fhir/resources/patient) in the Medplum app.

Open the Medplum app in your browser: https://app.medplum.com/ If you don't have an account yet, see the [Register](./register) page.

When you sign in to Medplum, you will see a Patient list by default.

Click on the "New" button to start creating a new Patient.

Let's create a patient with only a few fields. We can always add more later. We will add:

- Name
- Gender
- Date of birth

Scroll down to "Name". Patients in Medplum can have multiple names. Let's add our first name by clicking the "Add" button.

Enter the given name, or "first name", in the "Given" field.

Enter the family name, or "last name", in the "Family" field.

Scroll down to "Gender". Start typing a gender such as "male", "female", or "other". You can use the autocomplete functionality to choose the desired value. The "gender" can be one of the FHIR [Administrative Gender](https://www.hl7.org/fhir/valueset-administrative-gender.html) values.

Scroll down to "Birth Date". Enter a date of birth.

Scroll all the way to the bottom and click "OK".

You now have a FHIR Patient resource.
