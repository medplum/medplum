import { render, screen } from '../test-utils/render';
import { CodingDisplay } from './CodingDisplay';

describe('CodingDisplay', () => {
  test('Renders display', () => {
    render(<CodingDisplay value={{ display: 'Display Text', code: '123' }} />);
    expect(screen.getByText('Display Text')).toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
  });

  test('Renders code', () => {
    render(<CodingDisplay value={{ code: '123' }} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<CodingDisplay />);
  });
});
