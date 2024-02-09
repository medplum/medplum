import { HTTP_HL7_ORG, isPopulated, parseStructureDefinition } from '@medplum/core';
import { buildElementsContext } from './ElementsInput.utils';
import { USCoreStructureDefinitionList } from '@medplum/mock';

describe('buildElementsContext', () => {
  test('deeply nested schema', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`;
    const sd = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
    if (!isPopulated(sd)) {
      fail(`Expected structure definition for ${profileUrl} to be found`);
    }
    const schema = parseStructureDefinition(sd);

    const context = buildElementsContext({
      elements: schema.elements,
      path: 'MedicationRequest',
      parentContext: undefined,
      profileUrl,
    });

    if (context === undefined) {
      fail('Expected context to be defined');
    }

    expect(context.profileUrl).toEqual(sd.url);
    expect(context.elements['dosageInstruction.method']).toBeDefined();
    expect(context.elementsByPath['MedicationRequest.dosageInstruction.method']).toBeDefined();
    expect(context.elements['dosageInstruction.method']).toBe(
      context.elementsByPath['MedicationRequest.dosageInstruction.method']
    );
  });
});
