

# User Configuration

The [UserConfiguration](/docs/api/fhir/medplum/userconfiguration) resource is used to configure user-specific settings or settings that you want a group of users to share. To do this, you need to create a UserConfiguration resource and reference it in each of the Users's [ProjectMembership](/docs/api/fhir/medplum/projectmembership) resources that you want to apply the settings to.

For example:

```ts
{
  "resourceType": "ProjectMembership",
  "userConfiguration": {
    "reference": "UserConfiguration/<your-user-configuration-id>",
    "display": "User Configuration Name"
  },
  //...
}
```

## Custom Menu on the Medplum App Sidebar

The Medplum App has a sidebar that displays a list of resources.

You can add a custom menu to the sidebar by setting the `UserConfiguration.menu` field. Notice that the target is a FHIR path query that can include filters, sorting, paging, etc.

```ts
{
  "resourceType": "UserConfiguration",
  "menu": [
    {
      "title": "My Custom Menu",
      "link": [
        {
          "name": "Patient",
          "target": "/Patient"
        },
        {
          "name": "Practitioner",
          "target": "/Practitioner"
        },
        {
          "name": "Observations - Heart Rate",
          "target": "/Observation?code=http://loinc.org|8867-4"
        }
      ]
    }
  ],
  //...
}
```

![User Configuration Menu](./custom-menu.png)

## User-specific FHIR Quota Rate Limits

The `UserConfiguration.fhirQuota` field is used to configure a custom FHIR quota for a Bot, User, or ClientApplication. See [FHIR Quota Rate Limits](/docs/rate-limits#fhir-interaction-load-rate-limit) for more information.

For example:

```ts
{
  "resourceType": "UserConfiguration",
  "option": [
    {
      "id": "fhirQuota",
      "valueInteger": 60000
    }
  ],
  //...
}
```

