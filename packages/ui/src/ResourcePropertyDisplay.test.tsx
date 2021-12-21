import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  ContactPoint,
  ElementDefinition,
  HumanName,
  Identifier,
  Quantity,
  Reference,
  SubscriptionChannel,
} from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const schema: IndexedStructureDefinition = {
  types: {
    Observation: {
      display: 'Observation',
      properties: {
        meta: {
          path: 'Observation.meta',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Meta',
            },
          ],
        },
        language: {
          path: 'Observation.language',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        text: {
          path: 'Observation.text',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Narrative',
            },
          ],
        },
        identifier: {
          path: 'Observation.identifier',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Identifier',
            },
          ],
        },
        basedOn: {
          path: 'Observation.basedOn',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/CarePlan',
                'http://hl7.org/fhir/StructureDefinition/DeviceRequest',
                'http://hl7.org/fhir/StructureDefinition/ImmunizationRecommendation',
                'http://hl7.org/fhir/StructureDefinition/MedicationRequest',
                'http://hl7.org/fhir/StructureDefinition/NutritionOrder',
                'http://hl7.org/fhir/StructureDefinition/ServiceRequest',
              ],
            },
          ],
        },
        partOf: {
          path: 'Observation.partOf',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/MedicationAdministration',
                'http://hl7.org/fhir/StructureDefinition/MedicationDispense',
                'http://hl7.org/fhir/StructureDefinition/MedicationStatement',
                'http://hl7.org/fhir/StructureDefinition/Procedure',
                'http://hl7.org/fhir/StructureDefinition/Immunization',
                'http://hl7.org/fhir/StructureDefinition/ImagingStudy',
              ],
            },
          ],
        },
        status: {
          path: 'Observation.status',
          min: 1,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        category: {
          path: 'Observation.category',
          min: 0,
          max: '*',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        code: {
          path: 'Observation.code',
          min: 1,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        subject: {
          path: 'Observation.subject',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Patient',
                'http://hl7.org/fhir/StructureDefinition/Group',
                'http://hl7.org/fhir/StructureDefinition/Device',
                'http://hl7.org/fhir/StructureDefinition/Location',
              ],
            },
          ],
        },
        focus: {
          path: 'Observation.focus',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: ['http://hl7.org/fhir/StructureDefinition/Resource'],
            },
          ],
        },
        encounter: {
          path: 'Observation.encounter',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: ['http://hl7.org/fhir/StructureDefinition/Encounter'],
            },
          ],
        },
        'effective[x]': {
          path: 'Observation.effective[x]',
          min: 0,
          max: '1',
          type: [
            {
              code: 'dateTime',
            },
            {
              code: 'Period',
            },
            {
              code: 'Timing',
            },
            {
              code: 'instant',
            },
          ],
        },
        issued: {
          path: 'Observation.issued',
          min: 0,
          max: '1',
          type: [
            {
              code: 'instant',
            },
          ],
        },
        performer: {
          path: 'Observation.performer',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Practitioner',
                'http://hl7.org/fhir/StructureDefinition/PractitionerRole',
                'http://hl7.org/fhir/StructureDefinition/Organization',
                'http://hl7.org/fhir/StructureDefinition/CareTeam',
                'http://hl7.org/fhir/StructureDefinition/Patient',
                'http://hl7.org/fhir/StructureDefinition/RelatedPerson',
              ],
            },
          ],
        },
        'value[x]': {
          path: 'Observation.value[x]',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Quantity',
            },
            {
              code: 'CodeableConcept',
            },
            {
              code: 'string',
            },
            {
              code: 'boolean',
            },
            {
              code: 'integer',
            },
            {
              code: 'Range',
            },
            {
              code: 'Ratio',
            },
            {
              code: 'SampledData',
            },
            {
              code: 'time',
            },
            {
              code: 'dateTime',
            },
            {
              code: 'Period',
            },
          ],
          condition: ['obs-7'],
        },
        dataAbsentReason: {
          path: 'Observation.dataAbsentReason',
          min: 0,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
          condition: ['obs-6'],
        },
        interpretation: {
          path: 'Observation.interpretation',
          min: 0,
          max: '*',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        note: {
          path: 'Observation.note',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Annotation',
            },
          ],
        },
        bodySite: {
          path: 'Observation.bodySite',
          min: 0,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        method: {
          path: 'Observation.method',
          min: 0,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        specimen: {
          path: 'Observation.specimen',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: ['http://hl7.org/fhir/StructureDefinition/Specimen'],
            },
          ],
        },
        device: {
          path: 'Observation.device',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Device',
                'http://hl7.org/fhir/StructureDefinition/DeviceMetric',
              ],
            },
          ],
        },
        referenceRange: {
          path: 'Observation.referenceRange',
          min: 0,
          max: '*',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
        hasMember: {
          path: 'Observation.hasMember',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Observation',
                'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse',
                'http://hl7.org/fhir/StructureDefinition/MolecularSequence',
              ],
            },
          ],
        },
        derivedFrom: {
          path: 'Observation.derivedFrom',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/DocumentReference',
                'http://hl7.org/fhir/StructureDefinition/ImagingStudy',
                'http://hl7.org/fhir/StructureDefinition/Media',
                'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse',
                'http://hl7.org/fhir/StructureDefinition/Observation',
                'http://hl7.org/fhir/StructureDefinition/MolecularSequence',
              ],
            },
          ],
        },
        component: {
          path: 'Observation.component',
          min: 0,
          max: '*',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
      },
    },
    Patient: {
      display: 'Patient',
      properties: {
        meta: {
          path: 'Patient.meta',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Meta',
            },
          ],
        },
        language: {
          path: 'Patient.language',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        text: {
          path: 'Patient.text',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Narrative',
            },
          ],
        },
        identifier: {
          path: 'Patient.identifier',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Identifier',
            },
          ],
        },
        active: {
          path: 'Patient.active',
          min: 0,
          max: '1',
          type: [
            {
              code: 'boolean',
            },
          ],
          meaningWhenMissing:
            'This resource is generally assumed to be active if no value is provided for the active element',
        },
        name: {
          path: 'Patient.name',
          min: 0,
          max: '*',
          type: [
            {
              code: 'HumanName',
            },
          ],
        },
        telecom: {
          path: 'Patient.telecom',
          min: 0,
          max: '*',
          type: [
            {
              code: 'ContactPoint',
            },
          ],
        },
        gender: {
          path: 'Patient.gender',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        birthDate: {
          path: 'Patient.birthDate',
          min: 0,
          max: '1',
          type: [
            {
              code: 'date',
            },
          ],
        },
        'deceased[x]': {
          path: 'Patient.deceased[x]',
          min: 0,
          max: '1',
          type: [
            {
              code: 'boolean',
            },
            {
              code: 'dateTime',
            },
          ],
        },
        address: {
          path: 'Patient.address',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Address',
            },
          ],
        },
        maritalStatus: {
          path: 'Patient.maritalStatus',
          min: 0,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        'multipleBirth[x]': {
          path: 'Patient.multipleBirth[x]',
          min: 0,
          max: '1',
          type: [
            {
              code: 'boolean',
            },
            {
              code: 'integer',
            },
          ],
        },
        photo: {
          path: 'Patient.photo',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Attachment',
            },
          ],
        },
        contact: {
          path: 'Patient.contact',
          min: 0,
          max: '*',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
        communication: {
          path: 'Patient.communication',
          min: 0,
          max: '*',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
        generalPractitioner: {
          path: 'Patient.generalPractitioner',
          min: 0,
          max: '*',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Organization',
                'http://hl7.org/fhir/StructureDefinition/Practitioner',
                'http://hl7.org/fhir/StructureDefinition/PractitionerRole',
              ],
            },
          ],
        },
        managingOrganization: {
          path: 'Patient.managingOrganization',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
            },
          ],
        },
        link: {
          path: 'Patient.link',
          min: 0,
          max: '*',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
      },
    },
    PatientContact: {
      display: 'PatientContact',
      parentType: 'Patient',
      properties: {
        relationship: {
          path: 'Patient.contact.relationship',
          min: 0,
          max: '*',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        name: {
          path: 'Patient.contact.name',
          min: 0,
          max: '1',
          type: [
            {
              code: 'HumanName',
            },
          ],
        },
        telecom: {
          path: 'Patient.contact.telecom',
          min: 0,
          max: '*',
          type: [
            {
              code: 'ContactPoint',
            },
          ],
        },
        address: {
          path: 'Patient.contact.address',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Address',
            },
          ],
        },
        gender: {
          path: 'Patient.contact.gender',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        organization: {
          path: 'Patient.contact.organization',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
            },
          ],
          condition: ['pat-1'],
        },
        period: {
          path: 'Patient.contact.period',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Period',
            },
          ],
        },
      },
    },
    PatientCommunication: {
      display: 'PatientCommunication',
      parentType: 'Patient',
      properties: {
        language: {
          path: 'Patient.communication.language',
          min: 1,
          max: '1',
          type: [
            {
              code: 'CodeableConcept',
            },
          ],
        },
        preferred: {
          path: 'Patient.communication.preferred',
          min: 0,
          max: '1',
          type: [
            {
              code: 'boolean',
            },
          ],
        },
      },
    },
    PatientLink: {
      display: 'PatientLink',
      parentType: 'Patient',
      properties: {
        other: {
          path: 'Patient.link.other',
          min: 1,
          max: '1',
          type: [
            {
              code: 'Reference',
              targetProfile: [
                'http://hl7.org/fhir/StructureDefinition/Patient',
                'http://hl7.org/fhir/StructureDefinition/RelatedPerson',
              ],
            },
          ],
        },
        type: {
          path: 'Patient.link.type',
          min: 1,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
      },
    },
    Subscription: {
      display: 'Subscription',
      properties: {
        meta: {
          path: 'Subscription.meta',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Meta',
            },
          ],
        },
        language: {
          path: 'Subscription.language',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        text: {
          path: 'Subscription.text',
          min: 0,
          max: '1',
          type: [
            {
              code: 'Narrative',
            },
          ],
        },
        status: {
          path: 'Subscription.status',
          min: 1,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        contact: {
          path: 'Subscription.contact',
          min: 0,
          max: '*',
          type: [
            {
              code: 'ContactPoint',
            },
          ],
        },
        end: {
          path: 'Subscription.end',
          min: 0,
          max: '1',
          type: [
            {
              code: 'instant',
            },
          ],
        },
        reason: {
          path: 'Subscription.reason',
          min: 1,
          max: '1',
          type: [
            {
              code: 'string',
            },
          ],
        },
        criteria: {
          path: 'Subscription.criteria',
          min: 1,
          max: '1',
          type: [
            {
              code: 'string',
            },
          ],
        },
        error: {
          path: 'Subscription.error',
          min: 0,
          max: '1',
          type: [
            {
              code: 'string',
            },
          ],
        },
        channel: {
          path: 'Subscription.channel',
          min: 1,
          max: '1',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
      },
    },
    SubscriptionChannel: {
      display: 'SubscriptionChannel',
      parentType: 'Subscription',
      properties: {
        type: {
          path: 'Subscription.channel.type',
          min: 1,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        endpoint: {
          path: 'Subscription.channel.endpoint',
          min: 0,
          max: '1',
          type: [
            {
              code: 'url',
            },
          ],
        },
        payload: {
          path: 'Subscription.channel.payload',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        header: {
          path: 'Subscription.channel.header',
          min: 0,
          max: '*',
          type: [
            {
              code: 'string',
            },
          ],
        },
      },
    },
  },
};

describe('ResourcePropertyDisplay', () => {
  test('Renders null value', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.string}
        value={null}
      />
    );
  });

  test('Renders boolean true', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.boolean}
        value={true}
      />
    );
    expect(screen.getByText('true')).toBeDefined();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders boolean false', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.boolean}
        value={false}
      />
    );
    expect(screen.getByText('false')).toBeDefined();
    expect(screen.queryByText('true')).toBeNull();
  });

  test('Renders boolean undefined', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.boolean}
        value={undefined}
      />
    );
    expect(screen.queryByText('true')).toBeNull();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders string', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.string}
        value={'hello'}
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders canonical', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'canonical' }] }}
        propertyType={PropertyType.canonical}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders url', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'url' }] }}
        propertyType={PropertyType.url}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeDefined();
  });

  test('Renders uri', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'uri' }] }}
        propertyType={PropertyType.uri}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeDefined();
  });

  test('Renders string array', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.SubscriptionChannel.properties.header}
        propertyType={PropertyType.string}
        value={['hello', 'world']}
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
    expect(screen.getByText('world')).toBeDefined();
  });

  test('Renders markdown', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'markdown' }] }}
        propertyType={PropertyType.markdown}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders Address', () => {
    const value: Address = {
      city: 'London',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Address' }] }}
        propertyType={PropertyType.Address}
        value={value}
      />
    );

    expect(screen.getByText('London')).toBeDefined();
  });

  test('Renders Annotation', () => {
    const value: Annotation = {
      text: 'hello',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Annotation' }] }}
        propertyType={PropertyType.Annotation}
        value={value}
      />
    );

    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders Attachment', () => {
    const value: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/file.txt',
      title: 'file.txt',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Attachment' }] }}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );

    expect(screen.getByText('file.txt')).toBeDefined();
  });

  test('Renders Attachment array', () => {
    const value: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/file.txt',
        title: 'file.txt',
      },
      {
        contentType: 'text/plain',
        url: 'https://example.com/file2.txt',
        title: 'file2.txt',
      },
    ];

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Patient.properties.photo}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );
    expect(screen.getByText('file.txt')).toBeDefined();
    expect(screen.getByText('file2.txt')).toBeDefined();
  });

  test('Renders CodeableConcept', () => {
    const value: CodeableConcept = {
      text: 'foo',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={schema.types.Observation.properties['value[x]']}
        propertyType={PropertyType.CodeableConcept}
        value={value}
      />
    );

    expect(screen.getByText('foo')).toBeDefined();
  });

  test('Renders ContactPoint', () => {
    const value: ContactPoint = {
      system: 'email',
      value: 'foo@example.com',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'ContactPoint' }] }}
        propertyType={PropertyType.ContactPoint}
        value={value}
      />
    );

    expect(screen.getByText('foo@example.com [email]')).toBeDefined();
  });

  test('Renders HumanName', () => {
    const value: HumanName = {
      family: 'Smith',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'HumanName' }] }}
        propertyType={PropertyType.HumanName}
        value={value}
      />
    );

    expect(screen.getByText('Smith')).toBeDefined();
  });

  test('Renders Identifier', () => {
    const value: Identifier = {
      system: 'xyz',
      value: 'xyz123',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Identifier' }] }}
        propertyType={PropertyType.Identifier}
        value={value}
      />
    );

    expect(screen.getByText('xyz: xyz123')).toBeDefined();
  });

  test('Renders Quantity', () => {
    const value: Quantity = {
      value: 1,
      unit: 'mg',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Quantity' }] }}
        propertyType={PropertyType.Quantity}
        value={value}
      />
    );

    expect(screen.getByText('1 mg')).toBeDefined();
  });

  test('Renders Reference', () => {
    const value: Reference = {
      reference: 'Patient/123',
      display: 'John Smith',
    };

    render(
      <MemoryRouter>
        <ResourcePropertyDisplay
          schema={schema}
          property={{ type: [{ code: 'Reference' }] }}
          propertyType={PropertyType.Reference}
          value={value}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(value.display as string)).toBeDefined();
  });

  test('Renders BackboneElement', () => {
    const value: SubscriptionChannel = {
      type: 'rest-hook',
      endpoint: 'https://example.com/hook',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ path: 'Subscription.channel', type: [{ code: 'BackboneElement' }] }}
        propertyType={PropertyType.BackboneElement}
        value={value}
      />
    );

    expect(screen.getByText(value.endpoint as string)).toBeDefined();
  });

  test('getValueAndType', () => {
    expect(getValueAndType(null, {} as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, {} as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: '' } as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: 'x' } as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: 'x', type: [] } as ElementDefinition)[0]).toBeUndefined();
    expect(
      getValueAndType({}, { path: 'x', type: [{ code: 'foo' }, { code: 'bar' }] } as ElementDefinition)[0]
    ).toBeUndefined();
  });
});
