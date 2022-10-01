import { EncounterTimeline, ResourceBlame, ResourceTimeline } from '.';

describe('Index', () => {
  test('UI imports', () => {
    expect(EncounterTimeline).toBeDefined();
    expect(ResourceBlame).toBeDefined();
    expect(ResourceTimeline).toBeDefined();
  });
});
