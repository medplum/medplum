# Medplum Seeder

This is a utility that populates a Medplum Server with the initial resources.

Run the seeder:

```
npm run seed
```

What it creates:
* Medplum Project
* Medplum Organization
* Admin user
* All [StructureDefinition](http://www.hl7.org/fhir/structuredefinition.html) resources

In the future:
* [CodeSystem](https://www.hl7.org/fhir/codesystem.html) resources
* [ValueSet](https://www.hl7.org/fhir/valueset.html) resources
