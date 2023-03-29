import { convertTimingToCron } from './scheduledtiming';

jest.mock('node-fetch');

describe('convertTimingToCron', () => {
  test('cron pattern for repeat periods of every 2nd hour', () => {
    const timing = {
      repeat: {
        period: 15,
      },
    };

    const expected = {
      repeat: {
        pattern: '0 */2 * * *',
      },
    };

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for repeat periods of every 30 min', () => {
    const timing = {
      repeat: {
        period: 48,
      },
    };

    const expected = {
      repeat: {
        pattern: '*/30 * * * *',
      },
    };

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for specific days of the week', () => {
    const timing = {
      repeat: {
        dayOfWeek: ['mon', 'wed', 'fri'] as ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[],
      },
    };

    const expected = {
      repeat: {
        pattern: '0 */24 * * 1,3,5',
      },
    };

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for no repeat period or days of the week', () => {
    const timing = {};

    const expected = undefined;

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });
});
