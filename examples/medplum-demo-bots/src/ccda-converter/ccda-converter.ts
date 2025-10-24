// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Media, Observation, Patient } from '@medplum/fhirtypes';
import { XMLParser } from 'fast-xml-parser';

// Helper function to safely access nested properties
function getElementAtPath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function convertCcdaToFhir(xmlContent: string): {
  patient: Patient;
  observations: Observation[];
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
  });

  const parsedData = parser.parse(xmlContent);
  const clinicalDoc = parsedData.ClinicalDocument;

  // Extract patient information
  const patientRole = getElementAtPath(clinicalDoc, 'recordTarget.patientRole');
  const patientEle = patientRole.patient;
  const name = patientEle.name;
  const addr = patientRole.addr;

  const birthTime = patientEle.birthTime['@_value']?.toString();

  // Create FHIR Patient resource
  const patient: Patient = {
    resourceType: 'Patient',
    id: patientRole.id['@_extension'],
    name: [
      {
        use: (name['@_use'] || 'official').toLowerCase(),
        family: name.family,
        given: Array.isArray(name.given) ? name.given : [name.given],
        suffix: name.suffix ? [name.suffix] : undefined,
      },
    ],
    gender: patientEle.administrativeGenderCode['@_code'] === 'M' ? 'male' : 'female',
    birthDate: birthTime?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    address: [
      {
        use: (addr['@_use'] || 'home').toLowerCase(),
        line: [addr.streetAddressLine?.trim()],
        city: addr.city?.trim(),
        state: addr.state?.trim(),
        postalCode: addr.postalCode.toString()?.trim(),
        country: addr.country?.trim(),
      },
    ],
    telecom: Array.isArray(patientRole.telecom)
      ? patientRole.telecom.map((tel: any) => ({
          system: 'phone',
          value: tel['@_value']?.replace('tel:', ''),
          use: tel['@_use']?.toLowerCase(),
        }))
      : [
          {
            system: 'phone',
            value: patientRole.telecom['@_value']?.replace('tel:', ''),
            use: patientRole.telecom['@_use']?.toLowerCase(),
          },
        ],
  };

  // Find vital signs section and extract observations
  const components = Array.isArray(clinicalDoc.component.structuredBody.component)
    ? clinicalDoc.component.structuredBody.component
    : [clinicalDoc.component.structuredBody.component];

  const vitalSignsSection = components.find(
    (comp: any) => getElementAtPath(comp, 'section.code.@_code') === '8716-3'
  )?.section;

  const patientRef = createReference(patient);

  const observations = [] as Observation[];

  if (vitalSignsSection?.entry) {
    const components = Array.isArray(vitalSignsSection.entry.organizer.component)
      ? vitalSignsSection.entry.organizer.component
      : [vitalSignsSection.entry.organizer.component];

    for (const comp of components) {
      const obs = comp.observation;
      observations.push({
        resourceType: 'Observation',
        id: obs.id['@_extension'],
        status: obs.statusCode['@_code'],
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: obs.code['@_code'],
              display: obs.code['@_displayName'],
            },
          ],
        },
        valueQuantity: {
          value: Number.parseFloat(obs.value['@_value']),
          unit: obs.value['@_unit'],
          system: 'http://unitsofmeasure.org',
        },
        effectiveDateTime: obs.effectiveTime['@_value']?.toString()?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        subject: patientRef,
      });
    }
  }

  return {
    patient,
    observations,
  };
}

export async function handler(medplum: MedplumClient, event: BotEvent<Media>): Promise<any> {
  const { input } = event;
  // If the Media resource is not a C-CDA or doesn't have a content url, do not attempt to convert it
  if (input.content?.contentType !== 'application/cda+xml' || !input.content.url) {
    return;
  }

  // We get the raw XML by downloading it from the content.url
  const xml = await (await medplum.download(input.content.url)).text();

  // We convert the raw XML to a patient and some observations using our function we created
  const { patient, observations } = convertCcdaToFhir(xml);

  const promises = [] as Promise<any>[];
  // Read the subject of this Media
  const subject = input.subject ? await medplum.readReference(input.subject) : undefined;

  // If subject is present, we should update that subject with the fields we parsed from the patient section
  if (subject?.resourceType === 'Patient') {
    promises.push(medplum.updateResource({ ...subject, ...patient, id: subject.id }));
  } else {
    // Otherwise we just create this patient net-new
    promises.push(medplum.createResource(patient));
  }

  // We go through each observation and create them as well
  for (const observation of observations) {
    promises.push(medplum.createResource(observation));
  }

  // We wait for all of our promises to resolve before exiting
  await Promise.allSettled(promises);
}
