import { EncounterTimeline, Loading, ResourceBlame, ResourceTimeline } from '.';

describe('Index', () => {
  test('UI imports', () => {
    expect(EncounterTimeline).toBeDefined();
    expect(Loading).toBeDefined();
    expect(ResourceBlame).toBeDefined();
    expect(ResourceTimeline).toBeDefined();
  });
});
