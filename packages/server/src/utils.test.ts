import express from 'express';
import { initApp, shutdownApp } from './app';
import { createProfile } from './auth/utils';
import { MedplumServerConfig, loadTestConfig } from './config';
import { createTestProject, withTestContext } from './test.setup';

describe('Utils', () => {
  let app: express.Express;
  let config: MedplumServerConfig;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('createProfile', () => {
    test('disableGravatarProfiles -- true', async () => {
      const { project } = await withTestContext(async () =>
        createTestProject({
          project: {
            setting: [{ name: 'disableGravatarProfiles', valueBoolean: true }],
          },
        })
      );
      const profile = await createProfile(project, 'Patient', 'Alice', 'Doe', 'alice@example.com');
      expect(profile.photo).toBeUndefined();
    });

    test.each([false, undefined])('disableGravatarProfiles -- %s', async (val) => {
      const { project } = await withTestContext(async () =>
        createTestProject({
          project:
            val !== undefined
              ? {
                  setting: [{ name: 'disableGravatarProfiles', valueBoolean: val }],
                }
              : {},
        })
      );
      const profile = await createProfile(project, 'Patient', 'Alice', 'Doe', 'alice@example.com');
      expect(profile.photo).toEqual([
        {
          contentType: 'image/png',
          title: 'profile.png',
          url: 'https://gravatar.com/avatar/ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976?s=256&r=pg&d=retro',
        },
      ]);
    });
  });
});
