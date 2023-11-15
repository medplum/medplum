import { render, screen } from '../test-utils/render';
import { HumanNameDisplay } from './HumanNameDisplay';

describe('HumanNameDisplay', () => {
  test('Renders', () => {
    render(
      <HumanNameDisplay
        value={{
          given: ['Alice'],
          family: 'Smith',
          use: 'official',
        }}
      />
    );

    expect(screen.getByText('Alice Smith')).toBeDefined();
  });

  test('Renders with options', () => {
    render(
      <HumanNameDisplay
        value={{
          given: ['Alice'],
          family: 'Smith',
          use: 'official',
        }}
        options={{ all: true }}
      />
    );

    expect(screen.getByText('Alice Smith [official]')).toBeDefined();
  });

  test('Handles null name', () => {
    expect(HumanNameDisplay({})).toBeNull();
  });
});
