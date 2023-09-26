import { Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { bcryptHashPassword } from '../auth/utils';
import { systemRepo } from '../fhir/repo';
import { ProfileResource, createReference } from '@medplum/core';

export async function createProject(
  name: string,
  adminName: string,
  adminEmail: string,
  adminPassword: string,
  data?: Partial<Project>
): Promise<[Project, User]> {
  const [firstName, lastName] = adminName.split(' ');
  const passwordHash = await bcryptHashPassword(adminPassword);
  const admin = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email: adminEmail,
    emailVerified: true,
    passwordHash,
  });

  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name,
    owner: createReference(admin),
    ...data,
  });
  const practitioner = await systemRepo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: project.id,
    },
    name: [
      {
        given: [firstName],
        family: lastName,
      },
    ],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: adminEmail,
      },
    ],
  });
  await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(admin),
    profile: createReference(practitioner),
    admin: true,
  });

  return [project, admin];
}

export async function createProjectUser(
  name: string,
  email: string,
  password: string,
  project: Project,
  profile: ProfileResource
): Promise<[ProfileResource, ProjectMembership]> {
  const [firstName, lastName] = name.split(' ');
  const passwordHash = await bcryptHashPassword(password);
  const user = await systemRepo.createResource<User>({
    resourceType: 'User',
    meta: { project: project.id },
    firstName,
    lastName,
    email,
    emailVerified: true,
    passwordHash,
  });
  const profileResource = await systemRepo.createResource({ ...profile, meta: { project: project.id } });
  const membership = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    meta: { project: project.id },
    project: createReference(project),
    user: createReference(user),
    profile: createReference(profileResource),
  });
  return [profileResource, membership];
}
