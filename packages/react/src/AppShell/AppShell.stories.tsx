import { ProfileResource, getReferenceString } from '@medplum/core';
import { useMedplumProfile } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import {
  Icon2fa,
  IconBellRinging,
  IconClipboardCheck,
  IconDatabaseImport,
  IconFingerprint,
  IconKey,
  IconMail,
  IconReceipt2,
  IconSettings,
} from '@tabler/icons-react';
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
