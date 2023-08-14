// start-block imports
import { MedplumClient } from '@medplum/core';
import { Project } from '@medplum/fhirtypes';

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

// start-block createProject
const newProject: Project = await medplum.createResource({
  resourceType: 'Project',
  name: 'ProjectName',
  strictMode: true,
});

await medplum.post('admin/projects/' + newProject.id + '/invite', {
  resourceType: 'Practitioner',
  firstName: '[firstname]',
  lastName: '[lastname]',
  email: '[email]',
  admin: true,
});
// end-block createProject
