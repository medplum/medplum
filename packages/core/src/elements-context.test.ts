import { ExtendedInternalSchemaElement, buildElementsContext } from './elements-context';
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
  const DEFAULT_EXTENDED_PROPS = { readonly: false, hidden: false };
  const HIDDEN = { readonly: true, hidden: true };
  const READONLY = { readonly: true, hidden: false };
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
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
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

  test('no hidden fields', () => {
    const schema = getDataType('Patient');

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: [] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);
    expect(apr).toBeDefined();

    const entriesBefore = Object.values(schema.elements).filter(Boolean).length;
    expect(entriesBefore).toEqual(24); // sanity check

    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }

    const entriesAfter = Object.values(context.elements).filter(Boolean).length;

    expect(entriesBefore - entriesAfter).toEqual(0);
    for (const key of Object.keys(context.elements)) {
      expect(context.getExtendedProps('Patient.' + key)).toEqual(DEFAULT_EXTENDED_PROPS);
    }
    expect(context.getExtendedProps('Patient')).toBeUndefined();
    expect(context.getExtendedProps('Patient.')).toBeUndefined();
    expect(context.getExtendedProps('Patient.badKey')).toEqual(DEFAULT_EXTENDED_PROPS);
  });

  test('some hidden fields', () => {
    const schema = getDataType('Patient');

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['gender', 'multipleBirthInteger'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    expect(schema.elements['gender']).toBeDefined();

    const entriesBefore = Object.values(schema.elements).filter(Boolean).length;
    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }
    const entriesAfter = Object.values(context.elements).filter(Boolean).length;

    // "multipelBirthInteger" is one of the possible types for "multipleBirth[x]", but
    // InternalTypeSchema references elements by their path, i.e. "multipleBirth[x]", so
    // attempting to hide "multipleBirthInteger" is expected to have no effect
    expect(context.elements['gender']).toBeUndefined();
    expect(entriesBefore - entriesAfter).toEqual(1);

    expect(context.getExtendedProps('Patient.gender')).toEqual(HIDDEN);
  });

  test('hidden parent element also removes child elements', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const schema = getSchemaFromProfileUrl(profileUrl);

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['name'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    const entriesBefore = Object.values(schema.elements).filter(Boolean).length;
    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }
    const entriesAfter = Object.values(context.elements).filter(Boolean).length;

    // includes name, name.id, name.use, name.family, name.given, etc.
    expect(entriesBefore - entriesAfter).toEqual(10);
    expect(context.getExtendedProps('Patient.name')).toEqual(HIDDEN);
    expect(context.getExtendedProps('Patient.name.given')).toEqual(HIDDEN);
    expect(context.getExtendedProps('Patient.name.family')).toEqual(HIDDEN);
  });

  test('hidden nested field leaves parent and siblings', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const schema = getSchemaFromProfileUrl(profileUrl);

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', hiddenFields: ['name.family'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    expect(schema.elements['name.family']).toBeDefined();

    const entriesBefore = Object.values(schema.elements).filter(Boolean).length;
    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }
    const entriesAfter = Object.values(context.elements).filter(Boolean).length;

    expect(context.elements['name.family']).toBeUndefined();
    expect(entriesBefore - entriesAfter).toEqual(1);
  });

  test('readonly fields are marked as readonly', () => {
    const schema = getDataType('Patient');

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        { resourceType: 'Patient', readonlyFields: ['gender', 'multipleBirthInteger', 'name.given', 'identifier'] },
      ],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    expect(schema.elements['gender']).toBeDefined();

    const entriesBefore = Object.values(schema.elements).filter(Boolean).length;
    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }
    const entriesAfter = Object.values(context.elements).filter(Boolean).length;

    expect(entriesBefore - entriesAfter).toEqual(0);

    expect(context.elements['gender'].readonly).toBe(true);
    expect(context.getExtendedProps('Patient.gender')).toEqual(READONLY);

    // "multipelBirthInteger" is one of the possible types for "multipleBirth[x]", but
    // InternalTypeSchema references elements by their path, i.e. "multipleBirth[x]", so
    // attempting to hide "multipleBirthInteger" is expected to have no effect
    expect(context.elements['multipleBirth[x]']).toBeDefined();
    expect(context.elements['multipleBirth[x]'].readonly).toBeUndefined();
    expect(context.getExtendedProps('Patient.multipleBirth[x]')).toEqual(DEFAULT_EXTENDED_PROPS);

    // name.given isn't explicitly an element in the schema, but it should still be marked as readonly via getExtendedProps
    // parent and sibling elements are not marked as readonly
    expect(context.elements['name.given']).toBeUndefined();
    expect(context.getExtendedProps('Patient.name.given')).toEqual(READONLY);
    expect(context.getExtendedProps('Patient.name')).toEqual(DEFAULT_EXTENDED_PROPS);
    expect(context.getExtendedProps('Patient.name.family')).toEqual(DEFAULT_EXTENDED_PROPS);

    // nested elements are also marked as readonly
    expect(context.elements['identifier'].readonly).toBe(true);
    expect(context.elements['identifier.system']).toBeUndefined();
    expect(context.getExtendedProps('Patient.identifier')).toEqual(READONLY);
    expect(context.getExtendedProps('Patient.identifier.system')).toEqual(READONLY);
    expect(context.getExtendedProps('Patient.identifier.value')).toEqual(READONLY);
  });

  test('setting readonly/hidden does not mutate DATA_TYPES', () => {
    // re-create the in-memory schema to ensure isolation from other tests
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);

    const schema = getDataType('Patient');

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient', readonlyFields: ['gender'], hiddenFields: ['identifier'] }],
    };
    const resource: Patient = {
      resourceType: 'Patient',
    };
    const apr = satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);

    function checkSchema(): void {
      const typeSchema = getDataType('Patient');
      expect(typeSchema.elements['gender']).toBeDefined();
      expect((typeSchema.elements['gender'] as ExtendedInternalSchemaElement).readonly).toBeUndefined();

      expect(typeSchema.elements['identifier']).toBeDefined();
      expect((typeSchema.elements['identifier'] as ExtendedInternalSchemaElement).readonly).toBeUndefined();
    }

    checkSchema();

    const context = buildElementsContext({
      elements: schema.elements,
      path: 'Patient',
      parentContext: undefined,
      accessPolicyResource: apr,
    });
    if (context === undefined) {
      fail('Expected context to be defined');
    }

    // schema remains unchanged
    checkSchema();
  });
});
