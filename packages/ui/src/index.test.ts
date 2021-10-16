import { EncounterTimeline, Loading, ResourceBlame, ResourceTimeline } from '.';

describe('Index', () => {

  test('UI imports', () => {
    expect(EncounterTimeline).not.toBeUndefined();
    expect(Loading).not.toBeUndefined();
    expect(ResourceBlame).not.toBeUndefined();
    expect(ResourceTimeline).not.toBeUndefined();
  });

});
