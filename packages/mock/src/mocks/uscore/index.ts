import { Device, Patient, StructureDefinition } from '@medplum/fhirtypes';
import StructureDefinitionList from './uscore-v5.0.1-structuredefinitions.json';
import { HTTP_HL7_ORG, deepClone } from '@medplum/core';
import { HomerSimpson } from '../simpsons';

export const USCoreStructureDefinitionList = StructureDefinitionList as StructureDefinition[];

export const HomerSimpsonUSCorePatient: Patient = {
  ...deepClone(HomerSimpson),
  extension: [
    {
      extension: [
        {
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2106-3',
            display: 'White',
          },
          url: 'ombCategory',
        },
      ],
      url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
    },
    {
      extension: [
        {
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2186-5',
            display: 'Not Hispanic or Latino',
          },
          url: 'ombCategory',
        },
      ],
      url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
    },
    {
      valueCode: 'M',
      url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
    },
    {
      valueCode: 'M',
      url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-sex`,
    },
    {
      valueCodeableConcept: {
        coding: [
          {
            system: 'urn:oid:2.16.840.1.113762.1.4.1021.32',
            code: 'M',
            display: 'Male',
          },
        ],
      },
      url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
    },
  ],
};

// Based on https://hl7.org/fhir/us/core/STU5.0.1/Device-udi-3.json
export const ImplantableDeviceKnee: Device = {
  resourceType: 'Device',
  id: 'udi-3',
  meta: {
    extension: [
      {
        url: `${HTTP_HL7_ORG}/fhir/StructureDefinition/instance-name`,
        valueString: 'Device Knee Example',
      },
      {
        url: `${HTTP_HL7_ORG}/fhir/StructureDefinition/instance-description`,
        valueMarkdown: 'This is a Device knee example for the *US Core Implantable Device Profile*.',
      },
    ],
    versionId: '2',
    lastUpdated: '2019-04-11T16:21:48.921+00:00',
    profile: [`${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-implantable-device`],
  },
  identifier: [
    {
      system: 'http:/goodhealthhospital/identifier/devices',
      value: '12345',
    },
  ],
  udiCarrier: [
    {
      deviceIdentifier: '987979879879',
      carrierHRF: '(01)987979879879(11)191015(17)220101(10)M320(21)AC221',
      entryType: 'rfid',
    },
  ],
  status: 'active',
  manufacturer: 'ACME Biomedical',
  manufactureDate: '2015-10-15',
  expirationDate: '2022-01-01',
  lotNumber: 'M320',
  serialNumber: 'AC221',
  deviceName: [
    {
      name: 'ACME Knee Replacement Device',
      type: 'udi-label-name',
    },
  ],
  modelNumber: '1.0',
  type: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '109228008',
        display: 'Knee joint prosthesis',
      },
    ],
    text: 'Knee joint prosthesis',
  },
  patient: {
    reference: 'Patient/example',
    display: 'Amy V. Shaw',
  },
};
