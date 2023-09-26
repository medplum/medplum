import { AccessPolicy, Condition, Patient, ProjectMembership } from '@medplum/fhirtypes';
import { systemRepo } from '../fhir/repo';
import { createProject, createProjectUser } from './utils';
import { createReference } from '@medplum/core';

export async function testProject(): Promise<void> {
  const [project, _admin] = await createProject(
    'Stonefruit Therapeutics (Test)',
    'Stonefruit Admin',
    'admin@plum.example.com',
    'stonefruit_admin',
    { strictMode: true }
  );

  const [_practitioner, drMembership] = await createProjectUser(
    'Doctor Princess',
    'princess@plum.example.com',
    'princess,md',
    project,
    {
      resourceType: 'Practitioner',
      name: [
        {
          use: 'official',
          prefix: ['Dr.'],
          given: ['Doctor'],
          family: 'Princess',
          suffix: ['M.D.', 'Ph.D.'],
        },
      ],
      gender: 'female',
    }
  );
  const [patient, patientMembership] = await createProjectUser(
    'Johanna Tester',
    'johanna@test.example.com',
    'patient1',
    project,
    {
      resourceType: 'Patient',
      name: [
        {
          use: 'official',
          given: ['Johanna', 'Marie'],
          family: 'Tester',
        },
        {
          use: 'usual',
          given: ['Jo'],
        },
        {
          use: 'old',
          given: ['Johanna Marie'],
          family: 'Stevens',
        },
      ],
      birthDate: '1975-12-13',
      gender: 'female',
    }
  );

  const drAccessPolicy = await systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name: 'Clinicians',
    resource: [
      { resourceType: 'StructureDefinition' },
      { resourceType: 'ValueSet' },
      { resourceType: 'SearchParameter' },
      { resourceType: 'Practitioner' },
      { resourceType: 'Patient' },
      { resourceType: 'Observation' },
      { resourceType: 'Condition' },
    ],
  });
  const patientAccessPolicy = await systemRepo.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    meta: { project: project.id },
    name: 'Patients',
    resource: [
      { resourceType: 'StructureDefinition' },
      { resourceType: 'ValueSet' },
      { resourceType: 'SearchParameter' },
      { resourceType: 'Practitioner' },
      { resourceType: 'Patient', criteria: 'Patient?_compartment=%patient' },
      { resourceType: 'Observation', criteria: 'Observation?_compartment=%patient' },
      { resourceType: 'Condition', criteria: 'Condition?_compartment=%patient' },
    ],
  });

  await systemRepo.updateResource<ProjectMembership>({
    ...drMembership,
    access: [{ policy: createReference(drAccessPolicy) }],
  });
  await systemRepo.updateResource<ProjectMembership>({
    ...patientMembership,
    access: [
      {
        policy: createReference(patientAccessPolicy),
        parameter: [{ name: 'patient', valueReference: createReference(patient) }],
      },
    ],
  });

  const [patient2, membership2] = await createProjectUser(
    'Justin Testudo',
    'justin@test.example.com',
    'patient2',
    project,
    {
      resourceType: 'Patient',
      name: [
        {
          use: 'official',
          given: ['Justin', 'Webster'],
          family: 'Testudo',
        },
      ],
      birthDate: '1997-02-08',
      gender: 'male',
    }
  );
  await systemRepo.updateResource<ProjectMembership>({
    ...membership2,
    access: [
      {
        policy: createReference(patientAccessPolicy),
        parameter: [{ name: 'patient', valueReference: createReference(patient2) }],
      },
    ],
  });

  await systemRepo.createResource<Condition>({
    resourceType: 'Condition',
    meta: { project: project.id },
    clinicalStatus: {
      coding: [{ system: 'http://hl7.org/fhir/ValueSet/condition-clinical', code: 'active' }],
    },
    subject: createReference(patient as Patient),
    code: {
      coding: [{ system: 'http://snomed.info/sct', code: '195967001', display: 'Asthma (disorder)' }],
    },
    onsetAge: {
      code: 'a',
      value: 12,
    },
  });

  await systemRepo.createResource<Condition>({
    resourceType: 'Condition',
    meta: { project: project.id },
    clinicalStatus: {
      coding: [{ system: 'http://hl7.org/fhir/ValueSet/condition-clinical', code: 'inactive' }],
    },
    subject: createReference(patient2 as Patient),
    code: {
      coding: [{ system: 'http://snomed.info/sct', code: '38907003', display: 'Varicella (disorder)' }],
      text: 'Chickenpox',
    },
    onsetDateTime: '2004-10-01',
    abatementDateTime: '2004-10-15',
  });
}
