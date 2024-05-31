import { ElementsInput } from './ElementsInput';
import { render, screen } from '../test-utils/render';
import { ElementsContext } from './ElementsInput.utils';
import { ElementsContextType } from '@medplum/core';

const elementsContext: ElementsContextType = {
  debugMode: false,
  elements: {
    test: {
      description: 'test',
      max: 1,
      min: 0,
      path: 'test',
      type: [{ code: 'testCode', profile: ['testProfile'], targetProfile: ['testTargetProfile'] }],
    },
  },
  elementsByPath: {
    test: {
      description: 'test',
      max: 1,
      min: 0,
      path: 'test',
      type: [{ code: 'testCode', profile: ['testProfile'], targetProfile: ['testTargetProfile'] }],
    },
  },
  path: 'elements',
  profileUrl: 'testProfileUrl',
  getExtendedProps: () => undefined,
};

const onChange = jest.fn();
describe('ElementsInput', () => {
  test('Renders', () => {
    render(
      <ElementsContext.Provider value={elementsContext}>
        <ElementsInput
          defaultValue={'testValue'}
          onChange={onChange}
          outcome={undefined}
          path="test"
          testId="test"
          type="elementsinput"
        />
      </ElementsContext.Provider>
    );

    expect(screen.getByTestId('test')).toBeDefined();
  });
});
