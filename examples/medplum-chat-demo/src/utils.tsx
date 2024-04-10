import { Filter, getReferenceString, Operator, parseReference, SearchRequest } from '@medplum/core';
import {
  Communication,
  Encounter,
  EncounterParticipant,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Resource,
} from '@medplum/fhirtypes';

export function cleanResource(resource: Resource): Resource {
  let meta = resource.meta;
  if (meta) {
    meta = {
      ...meta,
      lastUpdated: undefined,
      versionId: undefined,
      author: undefined,
    };
  }
  return {
    ...resource,
    meta,
  };
}

export function getPopulatedSearch(search: SearchRequest): SearchRequest {
  const filters = search.filters ?? getDefaultFilters(search.resourceType);
  const fields = search.fields ?? getDefaultFields(search.resourceType);
  const sortRules = search.sortRules ?? [{ code: '-_lastUpdated' }];

  return {
    resourceType: search.resourceType,
    filters,
    fields,
    sortRules,
  };
}

export function getDefaultFilters(resourceType: string): Filter[] {
  const filters = [];

  switch (resourceType) {
    case 'Communication':
      filters.push(
        { code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' },
        { code: 'status:not', operator: Operator.EQUALS, value: 'completed' }
      );
      break;
  }

  return filters;
}

export function getDefaultFields(resourceType: string): string[] {
  const fields = [];

  switch (resourceType) {
    case 'Communication':
      fields.push('topic', 'sender', 'recipient', 'sent');
      break;
    case 'Patient':
      fields.push('name', '_lastUpdated');
      break;
    default:
      fields.push('id');
  }

  return fields;
}

// A helper function to specifically get all of the people entered as a participant in the form
export function getRecipients(formData: QuestionnaireResponse): QuestionnaireResponseItemAnswer[] | undefined {
  const items = formData.item;
  const recipients: QuestionnaireResponseItemAnswer[] = [];

  if (!items) {
    return recipients;
  }

  for (const item of items) {
    if (item.linkId === 'participants') {
      if (!item.answer) {
        return recipients;
      }
      recipients.push(...item.answer);
    }
  }

  return recipients;
}

export function checkForInvalidRecipient(recipients: Communication['recipient']): boolean {
  if (!recipients) {
    return true;
  }

  for (const recipient of recipients) {
    const resourceType = parseReference(recipient)[0];
    if (
      resourceType !== 'Patient' &&
      resourceType !== 'Practitioner' &&
      resourceType !== 'RelatedPerson' &&
      resourceType !== 'CareTeam' &&
      resourceType !== 'Device' &&
      resourceType !== 'Organization' &&
      resourceType !== 'Group' &&
      resourceType !== 'HealthcareService' &&
      resourceType !== 'PractitionerRole'
    ) {
      return true;
    }
  }

  return false;
}

export function getAttenders(
  recipients: Communication['recipient'],
  profile: Practitioner,
  userIsParticipant: boolean = false
): EncounterParticipant[] {
  // Filter recipients to only practitioners
  const practitionerRecipients = recipients?.filter((recipient) => parseReference(recipient)[0] === 'Practitioner');

  // Add all the practitioners that are included on the thread as attendants on the encounter
  const attenders: EncounterParticipant[] = practitionerRecipients
    ? practitionerRecipients?.map((recipient) => {
        // check if the user is on the recipient list
        if (getReferenceString(profile) === getReferenceString(recipient)) {
          userIsParticipant = true;
        }

        return {
          type: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  code: 'ATND',
                  display: 'attender',
                },
              ],
            },
          ],
          individual: {
            reference: getReferenceString(recipient),
          },
        };
      })
    : [];

  if (!userIsParticipant) {
    attenders.push({
      type: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
              code: 'ATND',
              display: 'attender',
            },
          ],
        },
      ],
      individual: {
        reference: getReferenceString(profile),
      },
    });
  }

  return attenders;
}

export function shouldShowPatientSummary(encounter: Encounter): boolean {
  if (!encounter.subject) {
    return false;
  }

  if (parseReference(encounter.subject)[0] === 'Patient') {
    return true;
  }

  return false;
}
