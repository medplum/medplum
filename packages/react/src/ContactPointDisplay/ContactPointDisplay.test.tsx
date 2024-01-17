import { render, screen } from '../test-utils/render';
import { ContactPointDisplay } from './ContactPointDisplay';

describe('ContactPointDisplay', () => {
  test('Handles undefined value', () => {
    render(<ContactPointDisplay />);
  });

  test('Handles empty value', () => {
    render(<ContactPointDisplay value={{}} />);
  });

  test('Renders value', () => {
    render(<ContactPointDisplay value={{ value: 'homer@example.com' }} />);
    expect(screen.getByText('homer@example.com', { exact: false })).toBeInTheDocument();
  });

  test('Renders full', () => {
    render(<ContactPointDisplay value={{ system: 'email', use: 'home', value: 'homer@example.com' }} />);
    expect(screen.getByText('homer@example.com', { exact: false })).toBeInTheDocument();
  });

  test('Only use', () => {
    render(<ContactPointDisplay value={{ use: 'home', value: 'homer@example.com' }} />);
    expect(screen.getByText('homer@example.com', { exact: false })).toBeInTheDocument();
  });

  test('Only system', () => {
    render(<ContactPointDisplay value={{ use: 'home', value: 'homer@example.com' }} />);
    expect(screen.getByText('homer@example.com', { exact: false })).toBeInTheDocument();
  });
});
