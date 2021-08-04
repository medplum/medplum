import { EncounterTimeline, Loading, ResourceBlame } from '.';

test('UI imports', () => {
  expect(EncounterTimeline).not.toBeUndefined();
  expect(Loading).not.toBeUndefined();
  expect(ResourceBlame).not.toBeUndefined();
});
