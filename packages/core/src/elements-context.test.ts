import { removeHiddenFields, buildElementsContext } from './elements-context';
import { HTTP_HL7_ORG } from './constants';
import { isPopulated } from './utils';
import {
  InternalTypeSchema,
  getDataType,
  indexStructureDefinitionBundle,
  parseStructureDefinition,
} from './typeschema/types';
import { AccessPolicy, Bundle, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { readJson } from '@medplum/definitions';
import { AccessPolicyInteraction, satisfiedAccessPolicy } from './access';

describe('buildElementsContext', () => {
  let USCoreStructureDefinitions: StructureDefinition[];

  function getSchemaFromProfileUrl(url: string): InternalTypeSchema {
    const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
    if (!isPopulated(sd)) {
      fail(`Expected structure definition for ${url} to be found`);
    }
    return parseStructureDefinition(sd);
  }
  beforeAll(() => {
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
  });

  test('deeply nested schema', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`;
    const schema = getSchemaFromProfileUrl(profileUrl);

    const context = buildElementsContext({
      elements: schema.elements,
      path: 'MedicationRequest',
      parentContext: undefined,
      profileUrl,
    });

    if (context === undefined) {
      fail('Expected context to be defined');
    }

    expect(context.profileUrl).toEqual(profileUrl);
    expect(context.elements['dosageInstruction.method']).toBeDefined();
    expect(context.elementsByPath['MedicationRequest.dosageInstruction.method']).toBeDefined();
    expect(context.elements['dosageInstruction.method']).toBe(
      context.elementsByPath['MedicationRequest.dosageInstruction.method']
    );
  });

  test('building context at same path returns undefined', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const schema = getSchemaFromProfileUrl(profileUrl);
    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      profileUrl,
    });

    if (context === undefined) {
      fail('Expected context to be defined');
    }

    const samePath = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: context,
      profileUrl,
    });

    expect(samePath).toBeUndefined();
  });

  test('nested context', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const profileSchema = getSchemaFromProfileUrl(profileUrl);

    const context = buildElementsContext({
      elements: profileSchema.elements,
      path: 'Patient',
      parentContext: undefined,
      profileUrl,
    });

    if (context === undefined) {
      fail('Expected context to be defined');
    }

    const extensionUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`;
    const extensionSchema = getSchemaFromProfileUrl(extensionUrl);

    const extensionContext = buildElementsContext({
      elements: extensionSchema.elements,
      path: 'Patient.extension',
      parentContext: context,
      profileUrl: extensionUrl,
      debugMode: true,
    });

    if (extensionContext === undefined) {
      fail('Expected extension context to be defined');
    }

    expect(extensionContext.profileUrl).toEqual(extensionUrl);
    expect(Object.keys(extensionContext.elements)).toEqual(
      expect.arrayContaining(['extension', 'id', 'url', 'value[x]'])
    );

    expect(extensionContext.elements['extension'].slicing?.slices.length).toBe(3);
    expect(extensionContext.elements['extension']).toBe(extensionContext.elementsByPath['Patient.extension.extension']);

    expect(extensionContext.elements['url'].fixed).toEqual({
      type: 'uri',
      value: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    });
  });
});

describe.only('#applyHiddenFields', () => {
  let USCoreStructureDefinitions: StructureDefinition[];

  function getSchemaFromProfileUrl(url: string): InternalTypeSchema {
    const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
    if (!isPopulated(sd)) {
      fail(`Expected structure definition for ${url} to be found`);
    }
    return parseStructureDefinition(sd);
  }
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
  });

  test('no hidden fields', () => {
    const schema = getDataType('Patient');
    const elements = schema.elements;

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: [] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);
    expect(apr).toBeDefined();

    const entriesBefore = Object.values(elements).filter(Boolean).length;
    expect(entriesBefore).toEqual(24); // sanity check

    const result = removeHiddenFields(elements, apr);
    const entriesAfter = Object.values(result).filter(Boolean).length;

    expect(entriesBefore - entriesAfter).toEqual(0);
  });

  test('some hidden fields', () => {
    const schema = getDataType('Patient');
    const before = schema.elements;

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['gender'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    expect(before['gender']).toBeDefined();

    const entriesBefore = Object.values(before).filter(Boolean).length;
    const result = removeHiddenFields(before, apr);
    const entriesAfter = Object.values(result).filter(Boolean).length;

    expect(result['gender']).toBeUndefined();

    expect(entriesBefore - entriesAfter).toEqual(1);
  });

  test('hidden parent element also removes child elements', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const schema = getSchemaFromProfileUrl(profileUrl);

    const before = schema.elements;

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['name'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    const entriesBefore = Object.values(before).filter(Boolean).length;
    const after = removeHiddenFields(before, apr);
    const entriesAfter = Object.values(after).filter(Boolean).length;

    // includes name, name.id, name.use, name.family, name.given, etc.
    expect(entriesBefore - entriesAfter).toEqual(10);
  });

  test('hidden nested fields leave parent and siblings', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const schema = getSchemaFromProfileUrl(profileUrl);

    const before = schema.elements;

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['name.family'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    expect(before['name.family']).toBeDefined();

    const entriesBefore = Object.values(before).filter(Boolean).length;
    const after = removeHiddenFields(before, apr);
    const entriesAfter = Object.values(after).filter(Boolean).length;

    expect(after['name.family']).toBeUndefined();

    expect(entriesBefore - entriesAfter).toEqual(1);
  });
});
