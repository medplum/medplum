import { act, fireEvent, render, screen } from '../test-utils/render';
import { SensitiveTextarea } from './SensitiveTextarea';

describe('SensitiveTextarea', () => {
  test('Renders', async () => {
    const onChange = jest.fn();

    render(<SensitiveTextarea placeholder="secret" defaultValue="foo" onChange={onChange} />);

    const input = screen.getByPlaceholderText('secret') as HTMLTextAreaElement;
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.focus(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'bar' } });
    });

    expect(onChange).toHaveBeenCalled();
    expect(input.value).toBe('bar');

    const copyButton = screen.getByTitle('Copy secret');
    expect(copyButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(copyButton);
    });
  });
});
