// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import { useMedplumProfile } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import {
  Icon2fa,
  IconAlertTriangle,
  IconBellRinging,
  IconClipboardCheck,
  IconDatabaseImport,
  IconFingerprint,
  IconKey,
  IconMail,
  IconReceipt2,
  IconSettings,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useLayoutEffect } from 'react';
import { Logo } from '../Logo/Logo';
import { NotificationIcon } from '../NotificationIcon/NotificationIcon';
import { AppShell } from './AppShell';
import classes from './AppShell.stories.module.css';

export default {
  title: 'Medplum/AppShell',
  component: AppShell,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={[
          {
            title: 'My Menu',
            links: [
              { href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> },
              { href: '/billing', label: 'Billing', icon: <IconReceipt2 /> },
              { href: '/security', label: 'Security', icon: <IconFingerprint /> },
              { href: '/sshkeys', label: 'SSH Keys', icon: <IconKey /> },
              { href: '/databases', label: 'Databases', icon: <IconDatabaseImport /> },
              { href: '/auth', label: 'Authentication', icon: <Icon2fa /> },
              { href: '/settings', label: 'Other Settings', icon: <IconSettings /> },
            ],
          },
        ]}
        displayAddBookmark={true}
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function LongMenu(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={Array(100).fill({
          title: 'My Menu',
          links: [
            { href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> },
            { href: '/billing', label: 'Billing', icon: <IconReceipt2 /> },
            { href: '/security', label: 'Security', icon: <IconFingerprint /> },
            { href: '/sshkeys', label: 'SSH Keys', icon: <IconKey /> },
            { href: '/databases', label: 'Databases', icon: <IconDatabaseImport /> },
            { href: '/auth', label: 'Authentication', icon: <Icon2fa /> },
            { href: '/settings', label: 'Other Settings', icon: <IconSettings /> },
          ],
        })}
        displayAddBookmark={true}
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function DisabledSearch(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={Array(100).fill({
          title: 'My Menu',
          links: [
            { href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> },
            { href: '/billing', label: 'Billing', icon: <IconReceipt2 /> },
            { href: '/security', label: 'Security', icon: <IconFingerprint /> },
            { href: '/sshkeys', label: 'SSH Keys', icon: <IconKey /> },
            { href: '/databases', label: 'Databases', icon: <IconDatabaseImport /> },
            { href: '/auth', label: 'Authentication', icon: <Icon2fa /> },
            { href: '/settings', label: 'Other Settings', icon: <IconSettings /> },
          ],
        })}
        displayAddBookmark={true}
        headerSearchDisabled={true}
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function DisabledResourceNavigator(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={Array(100).fill({
          title: 'My Menu',
          links: [
            { href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> },
            { href: '/billing', label: 'Billing', icon: <IconReceipt2 /> },
            { href: '/security', label: 'Security', icon: <IconFingerprint /> },
            { href: '/sshkeys', label: 'SSH Keys', icon: <IconKey /> },
            { href: '/databases', label: 'Databases', icon: <IconDatabaseImport /> },
            { href: '/auth', label: 'Authentication', icon: <Icon2fa /> },
            { href: '/settings', label: 'Other Settings', icon: <IconSettings /> },
          ],
        })}
        displayAddBookmark={true}
        resourceTypeSearchDisabled={true}
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function NotificationIcons(): JSX.Element {
  const profile = useMedplumProfile();

  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={[
          {
            title: 'My Menu',
            links: [
              { href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> },
              { href: '/billing', label: 'Billing', icon: <IconReceipt2 /> },
              { href: '/security', label: 'Security', icon: <IconFingerprint /> },
              { href: '/sshkeys', label: 'SSH Keys', icon: <IconKey /> },
              { href: '/databases', label: 'Databases', icon: <IconDatabaseImport /> },
              { href: '/auth', label: 'Authentication', icon: <Icon2fa /> },
              { href: '/settings', label: 'Other Settings', icon: <IconSettings /> },
            ],
          },
        ]}
        displayAddBookmark={true}
        notifications={
          <>
            <NotificationIcon
              label="Mail"
              resourceType="Communication"
              countCriteria={`recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Communication?recipient=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconMail />}
              onClick={() => console.log('foo')}
            />
            <NotificationIcon
              label="Tasks"
              resourceType="Task"
              countCriteria={`owner=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Task?owner=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconClipboardCheck />}
              onClick={() => console.log('foo')}
            />
          </>
        }
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function DismissibleAnnouncement(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        menus={[
          {
            title: 'My Menu',
            links: [{ href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> }],
          },
        ]}
        announcements={[
          {
            id: 'maintenance-window',
            message: 'Expected system maintenance today from 8:00 PM to 8:30 PM Pacific.',
            color: 'blue',
            dismissible: true,
          },
        ]}
      >
        Your application here
      </AppShell>
    </div>
  );
}

const STACKED_PROJECTS = [
  'Cedar-Ridge-Prod',
  'Westbridge Production',
  'Westbridge Sandbox',
  'Starter-project',
  'Pinegrove Staging',
  'Lakeside EHR (prod)',
  'Brightpath Usage',
  'Summit Health - Staging',
  'Redwood Sandbox',
  'Summit Health - Production',
  'Harborlight Production',
  'Northstar Staging',
  'Clearwater Production',
  'Marlowe Sandbox',
];

const ONE_OTHER_PROJECT = ['Pinegrove Staging'] as const;

function ProjectMenuShell({
  layoutVersion,
  extraProjects,
}: {
  layoutVersion?: 'v1' | 'v2';
  extraProjects: readonly string[];
}): JSX.Element {
  useLayoutEffect(() => {
    const previous = localStorage.getItem('logins');
    const owner = `${Date.now()}-${Math.random()}`;
    localStorage.setItem('projectMenuStoryOwner', owner);
    const activeRaw = localStorage.getItem('activeLogin');
    const active = activeRaw ? (JSON.parse(activeRaw) as unknown) : undefined;
    const extras = extraProjects.map((name, index) => ({
      accessToken: `token-${index}`,
      refreshToken: `refresh-${index}`,
      profile: { reference: `Practitioner/extra-${index}`, display: 'Andy Stoneman' },
      project: { reference: `Project/extra-${index}`, display: name },
    }));
    localStorage.setItem('logins', JSON.stringify(active ? [active, ...extras] : extras));
    return () => {
      // A later story may already own the logins list.
      if (localStorage.getItem('projectMenuStoryOwner') !== owner) {
        return;
      }
      localStorage.removeItem('projectMenuStoryOwner');
      if (previous === null) {
        localStorage.removeItem('logins');
      } else {
        localStorage.setItem('logins', previous);
      }
    };
  }, [extraProjects]);

  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        layoutVersion={layoutVersion}
        menus={[
          {
            title: 'My Menu',
            links: [{ href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> }],
          },
        ]}
      >
        Your application here
      </AppShell>
    </div>
  );
}

export function ManyProjects(): JSX.Element {
  return <ProjectMenuShell layoutVersion="v2" extraProjects={STACKED_PROJECTS} />;
}

export function ManyProjectsHeader(): JSX.Element {
  return <ProjectMenuShell layoutVersion="v1" extraProjects={STACKED_PROJECTS} />;
}

export function OneOtherProject(): JSX.Element {
  return <ProjectMenuShell layoutVersion="v2" extraProjects={ONE_OTHER_PROJECT} />;
}

export function OneOtherProjectHeader(): JSX.Element {
  return <ProjectMenuShell layoutVersion="v1" extraProjects={ONE_OTHER_PROJECT} />;
}

export function PersistentAnnouncement(): JSX.Element {
  return (
    <div className={classes.root}>
      <AppShell
        logo={<Logo size={24} />}
        version="your.version"
        layoutVersion="v2"
        menus={[
          {
            title: 'My Menu',
            links: [{ href: '/notifications', label: 'Notifications', icon: <IconBellRinging /> }],
          },
        ]}
        announcements={[
          {
            message: 'Warning: logged in as super admin.',
            color: 'red',
            icon: <IconAlertTriangle size={16} />,
            role: 'alert',
          },
        ]}
      >
        Your application here
      </AppShell>
    </div>
  );
}
