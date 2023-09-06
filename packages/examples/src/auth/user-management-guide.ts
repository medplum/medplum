// start-block imports
import { MedplumClient } from '@medplum/core';
// end-block imports

const medplum = new MedplumClient();

// start-block searchProjectMembershipTs
await medplum.searchResources('ProjectMembership');
// end-block searchProjectMembershipTs

/*
// start-block searchProjectMembershipCli
medplum get 'ProjectMembership'
// end-block searchProjectMembershipCli

// start-block searchProjectMembershipCurl
curl 'https://api.medplum.com/fhir/R4/ProjectMembership' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchProjectMembershipCurl
*/

// start-block searchExcludingClientBotTs
await medplum.searchResources('ProjectMembership', 'profile-type:not=ClientApplication,Bot');
// end-block searchExcludingClientBotTs

/*
// start-block searchExcludingClientBotCli
medplum get 'ProjectMembership?profile-type:not=ClientApplication,Bot'
// end-block searchExcludingClientBotCli

// start-block searchExcludingClientBotCurl
curl 'https://api.medplum.com/fhir/R4/ProjectMembership?profile-type:not=ClientApplication,Bot' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchExcludingClientBotCurl
*/

// start-block searchProfileTypePatientTs
await medplum.searchResources('ProjectMembership', 'profile-type=Patient');
// end-block searchProfileTypePatientTs

/*
// start-block searchProfileTypePatientCli
medplum get 'ProjectMembership?profile-type=Patient'
// end-block searchProfileTypePatientCli

// start-block searchProfileTypePatientCurl
curl 'https://api.medplum.com/fhir/R4/ProjectMembership?profile-type=Patient' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchProfileTypePatientCurl
*/

// start-block searchProfileTypePractitionerTs
await medplum.searchResources('ProjectMembership', 'profile-type=Practitioner');
// end-block searchProfileTypePractitionerTs

/*
// start-block searchProfileTypePractitionerCli
medplum get 'ProjectMembership?profile-type=Practitioner'
// end-block searchProfileTypePractitionerCli

// start-block searchProfileTypePractitionerCurl
curl 'https://api.medplum.com/fhir/R4/ProjectMembership?profile-type=Practitioner' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchProfileTypePractitionerCurl
*/

// start-block createProjectTs
await medplum.createResource({
  resourceType: 'Project',
  name: 'ProjectName',
  strictMode: true,
});
// end-block createProjectTs

/*
// start-block createProjectCli
medplum post Project '{"resourceType":"Project","name":"ProjectName","strictMode":true}'
// end-block createProjectCli

// start-block createProjectCurl
curl 'https://api.medplum.com/admin/Project/' \
  -X POST \
  -H 'Authorization: Bearer ${accessToken}' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Project","name":"ProjectName","strictMode":true}'
// end-block createProjectCurl
*/

// start-block inviteNewAdminTs
await medplum.post('admin/projects/example-project-id/invite', {
  resourceType: 'Practitioner',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alicesmith@example.com',
  admin: true,
});
// end-block inviteNewAdminTs

/*
// start-block inviteNewAdminCli
medplum post admin/projects/example-project-id/invite \
'{
  "resourceType": "Practitioner",
  "firstName": "Alice",
  "lastName": "Smith",
  "email": "alicesmith@example.com",
  "admin": true
}'
// end-block inviteNewAdminCli

// start-block inviteNewAdminCurl
curl 'https://api.medplum.com/admin/projects/example-project-id/invite' \
  -H 'Authorization: Bearer ${accessToken}' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Practitioner","firstName":"Alice","lastName":"Smith","email":"alicesmith@example.com","admin":true}'
// end-block inviteNewAdminCurl
*/

// start-block makeAdminTs
// The user's project membership
const membership = {
  resourceType: 'ProjectMembership',
  id: 'example-membership-id',
  // ...
  admin: false,
};

// For the updated membership, create a new resource and spread the original in, only changing the admin field
const updatedMembership = {
  ...membership,
  admin: true,
};

// Finally, post the updated membership to the API to make the user an admin
await medplum.post(`admin/projects/example-project-id/members/example-membership-id`, updatedMembership);
// end-block makeAdminTs

/*
// start-block makeAdminCli
medplum patch 'admin/projects/example-project-id/members/example-membership-id' '[{"op": "replace", "path": "/admin", "value": true}]'
// end-block makeAdminCli

// start-block makeAdminCurl
curl -X PATCH 'https://api.medplum.com/admin/projects/example-project-id/members/example-membership-id' \
  -H 'Authorization: Bearer ${accessToken} \
  -H 'Content-Type: application/json-patch+json' \
  --data-raw '[{
    "op": "replace",
    "path": "/admin",
    "value": true
  }]'
// end-block makeAdminCurl
*/

/*
// start-block prepareJson
{
  "resourceType": "Patient",
  "firstName": "Homer",
  "lastName": "Simpson",
  "email": "homer@example.com",
  "sendEmail": false
}
// end-block prepareJson
*/

// start-block inviteUserTs
await medplum.post('/admin/projects/example-project-id/invite', {
  resourceType: 'Patient',
  firstName: 'Homer',
  lastName: 'Simpson',
  email: 'homer@example.com',
  sendEmail: false,
});
// end-block inviteUserTs

/*
// start-block inviteUserCli
medplum post 'admin/projects/example-project-id/invite' '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","email":"homer@example.com", "sendEmail":"false"}'
// end-block inviteUserCli

// start-block inviteUserCurl
curl 'https://api.medplum.com/admin/projects/example-project-id/invite' \
  -H 'Authorization: Bearer ${accessToken}' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","email":"homer@example.com", "sendEmail":"false"}'
// end-block inviteUserCurl
*/

/*
// start-block prepareJsonAdmin
{
  "resourceType": "Patient",
  "firstName": "Homer",
  "lastName": "Simpson",
  "email": "homer@example.com",
  "membership": {
    "admin": true,
  },
}
// end-block prepareJsonAdmin
*/

/*
// start-block prepareJsonAccessPolicy
{
  "resourceType": "Patient",
  "firstName": "Homer",
  "lastName": "Simpson",
  "email": "homer@example.com",
  "membership": {
    "access": [
      {
        "policy": { "reference": "AccessPolicy/123" },
        "parameter": [
          {
            "name": "provider_organization",
            "valueReference": { "reference": "Organization/abc" }
          }
        ]
      },
      {
        "policy": { "reference": "AccessPolicy/123" },
        "parameter": [
          {
            "name": "provider_organization",
            "valueReference": { "reference": "Organization/def" }
          }
        ]
      }
    ]
  }
}
// end-block prepareJsonAccessPolicy
*/
