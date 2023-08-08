import { TimeUnit, formatDuration } from './time';

describe('Time utils', () => {
  test.each([
    [undefined, undefined, '-'], // no input
    [1, 'ns', '1.00 ns'], // base case - no magnitude change
    [10, undefined, '10.0 ns'], // unit defaults to ns
    [1234, 'ns', '1.23 µs'], // magnitude delta 1
    [12345, undefined, '12.3 µs'],
    [1235, 'ns', '1.24 µs'], // rounding behavior
    [2.345e6, 'ns', '2.35 ms'], // magnitude delta 2
    [6.655e9, 'ns', '6.66 s'], // magnitude delta 3
    [4.929e4, 'ns', '49.3 µs'], // tens of different magnitude
    [9.876e5, 'ns', '988 µs'], // hundreds of different magnitude
    [1234, 'ms', '1.23 s'], // starting from greater unit
    [0.123, 'ms', '123 µs'], // reversing magnitude change
    [1.235e-6, 's', '1.24 µs'], // reverse magnitude change 2
  ])('formatDuration(%d, %s) === "%s"', (t, unit, expected) => {
    expect(formatDuration(t, unit as TimeUnit)).toEqual(expected);
  });
});
