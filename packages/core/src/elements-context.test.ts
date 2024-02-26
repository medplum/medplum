import { buildElementsContext } from './elements-context';
import { HTTP_HL7_ORG } from './constants';
import { isPopulated } from './utils';
import { InternalTypeSchema, parseStructureDefinition } from './typeschema/types';
import { StructureDefinition } from '@medplum/fhirtypes';
import { readJson } from '@medplum/definitions';

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
