import { convertToCompactXml, parseXml } from './xml';

describe('convertToCompactXml', () => {
  test('should preserve attributes', () => {
    const original = '<myElement id="123">John Doe</myElement>';
    const parsed = parseXml(original);
    expect(parsed).toMatchObject({
      myElement: {
        '#text': 'John Doe',
        '@_id': '123',
      },
    });
    const xml = convertToCompactXml(parsed);
    expect(xml).toEqual(original);
  });
});
