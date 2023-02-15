import { tokenize } from './tokenize';

describe('Mapping Language Tokenizer', () => {
  test('Mapping language', () => {
    const example = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

    group tutorial(source src : TLeft, target tgt : TRight) {

    // rules go here
    src.a as a -> tgt.a = a "rule_a";

    }
    `;

    const tokens = tokenize(example);
    expect(tokens.length).toBe(41);
  });
});
