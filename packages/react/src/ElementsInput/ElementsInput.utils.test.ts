import { getElementsToRender } from './ElementsInput.utils';

describe('ElementsInput.utils', () => {
  test('getElementsToRender', () => {
    const result = getElementsToRender({
      base: {
        description: 'baseElement',
        max: 10,
        min: 1,
        path: 'testPath',
        type: [{ code: 'testCode', profile: ['testProfile'], targetProfile: ['testTargetProfile'] }],
      },
      maxZero: {
        description: 'maxZeroElement',
        max: 0,
        min: 0,
        path: 'maxZeroPath',
        type: [{ code: 'maxZeroCode', profile: ['maxZeroProfile'], targetProfile: ['maxZeroTargetProfile'] }],
      },
      emptyType: {
        description: 'emptyTypeElement',
        max: 10,
        min: 1,
        path: 'emptyTypePath',
        type: [],
      },
      pathExtension: {
        description: 'pathExtensionElement',
        max: 10,
        min: 1,
        path: 'pathExtension.extension.url',
        fixed: { type: 'fixedType', value: 'fixedValue' },
        type: [
          {
            code: 'pathExtensionCode',
            profile: ['pathExtensionProfile'],
            targetProfile: ['pathExtensionTargetProfile'],
          },
        ],
      },
      extension: {
        description: 'extensionElement',
        max: 10,
        min: 1,
        path: 'extension',
        slicing: { discriminator: [], slices: [], ordered: false, rule: 'open' },
        type: [{ code: 'extensionCode', profile: ['extensionProfile'], targetProfile: ['extensionTargetProfile'] }],
      },
      id: {
        description: 'idElement',
        max: 10,
        min: 1,
        path: 'id',
        type: [{ code: 'idCode', profile: ['idProfile'], targetProfile: ['idTargetProfile'] }],
      },
      language: {
        description: 'languageElement',
        max: 10,
        min: 1,
        path: 'language.other',
        type: [{ code: 'languageCode', profile: ['languageProfile'], targetProfile: ['languageTargetProfile'] }],
      },
      'nested.key': {
        description: 'nestedElement',
        max: 10,
        min: 1,
        path: 'nested.key',
        type: [{ code: 'nestedCode', profile: ['nestedProfile'], targetProfile: ['nestedTargetProfile'] }],
      },
    });

    expect(result[0][0]).toBe('base');
    expect(result[0][1].description).toBe('baseElement');
    expect(result.length).toBe(1);
  });
});
