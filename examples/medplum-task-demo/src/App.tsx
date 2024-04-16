import { LoadingOverlay } from '@mantine/core';
import {
  MedplumClient,
  Operator,
  SearchRequest,
  capitalize,
  formatCodeableConcept,
  formatSearchQuery,
  getExtension,
  getReferenceString,
  normalizeErrorString,
} from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { AppShell, Loading, Logo, NavbarLink, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconCategory,
  IconChecklist,
  IconDatabaseImport,
  IconGridDots,
  IconMail,
  IconNurse,
  IconReportMedical,
  IconRibbonHealth,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { TaskPage } from './pages/TaskPage';
import { UploadDataPage } from './pages/UploadDataPage';

const SEARCH_TABLE_FIELDS = ['code', 'owner', 'for', 'priority', 'due-date', '_lastUpdated', 'performerType'];
const ALL_TASKS_LINK = {
  icon: <IconGridDots />,
  label: 'All Tasks',
  href: `/Task?_fields=${SEARCH_TABLE_FIELDS.join(',')}`,
};

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [userLinks, setUserLinks] = useState<NavbarLink[]>([]);
  const showLoadingOverlay = profile && (medplum.isLoading() || userLinks.length === 0);

  // Update the sidebar links associated with the Medplum profiles
  useEffect(() => {
    const profileReferenceString = profile && getReferenceString(profile);

    if (!profileReferenceString) {
      return;
    }

    // Construct the search for "My Tasks"
    const myTasksLink = getMyTasksLink(profileReferenceString);

    // Query the user's `PractitionerRole` resources to find all applicable roles
    getTasksByRoleLinks(medplum, profileReferenceString)
      .then((roleLinks) => {
        setUserLinks([myTasksLink, ...roleLinks, ...stateLinks, ALL_TASKS_LINK]);
      })
      .catch((error) => console.error('Failed to fetch PractitionerRoles', normalizeErrorString(error)));

    // Construct Search links for all Tasks for patients in the current user's licensed states
    const stateLinks = getTasksByState(profile as Practitioner);
  }, [profile, medplum]);

  return (
    <>
      <AppShell
        logo={<Logo size={24} />}
        menus={[
          {
            title: 'Tasks',
            links: userLinks,
          },
          {
            title: 'Upload Data',
            links: [
              { icon: <IconDatabaseImport />, label: 'Upload Core ValueSets', href: '/upload/core' },
              { icon: <IconChecklist />, label: 'Upload Example Tasks', href: '/upload/task' },
              { icon: <IconNurse />, label: 'Upload Example Certifications', href: '/upload/role' },
              {
                icon: <IconRibbonHealth />,
                label: 'Upload Example Licenses',
                href: '/upload/qualifications',
              },
              { icon: <IconRobot />, label: 'Upload Example Bots', href: '/upload/bots' },
              { icon: <IconReportMedical />, label: 'Upload Example Report', href: '/upload/report' },
              { icon: <IconMail />, label: 'Upload Example Messages', href: '/upload/message' },
            ],
          },
        ]}
        headerSearchDisabled={true}
      >
        <LoadingOverlay visible={showLoadingOverlay} />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <Navigate to={ALL_TASKS_LINK.href} /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
            <Route path="/Task/:id/*" element={<TaskPage />} />
            <Route path="/Task" element={<SearchPage />} />
            <Route path="/upload/:dataType" element={<UploadDataPage />} />
          </Routes>
        </Suspense>
      </AppShell>
    </>
  );
}

/**
 * @param profileReference - string representing the current user's profile
 * @returns a NavBar link to a search for all open `Tasks` assigned to the current user
 */
function getMyTasksLink(profileReference: string): NavbarLink {
  const myTasksQuery = formatSearchQuery({
    resourceType: 'Task',
    fields: SEARCH_TABLE_FIELDS,
    sortRules: [{ code: '-priority-order,due-date' }],
    filters: [
      { code: 'owner', operator: Operator.EQUALS, value: profileReference },
      { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
    ],
  });

  const myTasksLink = { icon: <IconCategory />, label: 'My Tasks', href: `/Task${myTasksQuery}` };
  return myTasksLink;
}

/**
 * @param medplum - the MedplumClient
 * @param profileReference - string representing the current user's profile
 * @returns an array of NavBarLinks to searches for all open `Tasks` assigned to the current user's roles
 */
async function getTasksByRoleLinks(medplum: MedplumClient, profileReference: string): Promise<NavbarLink[]> {
  const roles = await medplum.searchResources('PractitionerRole', {
    practitioner: profileReference,
  });

  // Query the user's `PractitionerRole` resources to find all applicable roles
  return roles
    .map((role) => {
      // For each role, generate a link to all open Tasks
      const roleCode = role?.code?.[0];

      if (!roleCode?.coding?.[0]?.code) {
        return undefined;
      }

      const search: SearchRequest = {
        resourceType: 'Task',
        fields: SEARCH_TABLE_FIELDS,
        sortRules: [{ code: '-priority-order,due-date' }],
        filters: [
          { code: 'owner:missing', operator: Operator.EQUALS, value: 'true' },
          { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
          { code: 'performer', operator: Operator.EQUALS, value: roleCode?.coding?.[0]?.code },
        ],
      };

      const searchQuery = formatSearchQuery(search);
      const roleDisplay = formatCodeableConcept(roleCode);
      return { icon: <IconUser />, label: `${roleDisplay} Tasks`, href: `/Task${searchQuery}` } as NavbarLink;
    })
    .filter((link): link is NavbarLink => !!link);
}

/**
 *
 * Read all the states for which this practitioner is licensed.
 * Refer to [Modeling Provider Qualifications](https://www.medplum.com/docs/administration/provider-directory/provider-credentials)
 * for more information on how to represent a clinician's licenses
 * @param profile - The resource representing the current user
 * @returns an array of NavBarLinks to searches for all open `Tasks` assigned to patients' in states
 *          where the current user is licensed
 */
function getTasksByState(profile: Practitioner): NavbarLink[] {
  const myStates =
    profile.qualification
      ?.map(
        (qualification) =>
          getExtension(
            qualification,
            'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
            'whereValid'
          )?.valueCodeableConcept?.coding?.find((coding) => coding.system === 'https://www.usps.com/')?.code
      )
      .filter((state): state is string => !!state) ?? [];

  return myStates.map((state) => {
    const search: SearchRequest = {
      resourceType: 'Task',
      fields: SEARCH_TABLE_FIELDS,
      sortRules: [{ code: '-priority-order,due-date' }],
      filters: [
        { code: 'owner:missing', operator: Operator.EQUALS, value: 'true' },
        { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
        { code: 'patient.address-state', operator: Operator.EQUALS, value: state },
      ],
    };
    const searchQuery = formatSearchQuery(search);
    return { icon: <IconUser />, label: `${capitalize(state)} Tasks`, href: `/Task${searchQuery}` } as NavbarLink;
  });
}
