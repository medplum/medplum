import { render, screen } from '../test-utils/render';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  test('Renders', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeDefined();
    expect(screen.getByText('active')).toHaveStyle('background-image:');
  });
});
