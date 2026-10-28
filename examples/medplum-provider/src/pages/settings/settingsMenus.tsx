// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { NavbarMenu } from '@medplum/react';
import {
  IconAdjustmentsHorizontal,
  IconApps,
  IconArrowBarLeft,
  IconBriefcase,
  IconBuildingBank,
  IconBuildingHospital,
  IconCalendarCog,
  IconReceipt2,
  IconShieldLock,
  IconStethoscope,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react';
import classes from './settingsMenus.module.css';

export const SETTINGS_PATH = '/settings';

/**
 * Whether a pathname is inside settings. Routes match case-insensitively, so the legacy `/Settings/Billing`
 * URLs land here too.
 * @param pathname - The current location pathname.
 * @returns True when the pathname is a settings page.
 */
export function isSettingsPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower === SETTINGS_PATH || lower.startsWith(`${SETTINGS_PATH}/`);
}

export interface SettingsMenuOptions {
  /** Where "Back to app" returns to: the last page visited outside settings. */
  readonly returnHref: string;
  readonly hasBilling: boolean;
}

/**
 * The navbar shown in place of the app navigation while on a settings page.
 * @param options - The return link and which feature-gated sections to show.
 * @returns The settings navbar menus.
 */
export function getSettingsMenus(options: SettingsMenuOptions): NavbarMenu[] {
  return [
    {
      links: [
        { icon: <IconArrowBarLeft className={classes.backIcon} />, label: 'Back to app', href: options.returnHref },
      ],
    },
    {
      title: 'Personal',
      links: [
        { icon: <IconUserCircle />, label: 'Account', href: `${SETTINGS_PATH}/account` },
        { icon: <IconAdjustmentsHorizontal />, label: 'Preferences', href: `${SETTINGS_PATH}/preferences` },
        { icon: <IconShieldLock />, label: 'Security', href: `${SETTINGS_PATH}/security` },
      ],
    },
    {
      title: 'Project',
      links: [
        { icon: <IconBriefcase />, label: 'General', href: `${SETTINGS_PATH}/project` },
        { icon: <IconUsers />, label: 'Members', href: `${SETTINGS_PATH}/members` },
        { icon: <IconApps />, label: 'Integrations', href: `${SETTINGS_PATH}/integrations` },
      ],
    },
    {
      title: 'Billing',
      links: [
        ...(options.hasBilling
          ? [
              {
                icon: <IconBuildingHospital />,
                label: 'Organizations',
                href: `${SETTINGS_PATH}/billing/organizations`,
              },
              { icon: <IconStethoscope />, label: 'Practitioners', href: `${SETTINGS_PATH}/billing/practitioners` },
              { icon: <IconBuildingBank />, label: 'Payers', href: `${SETTINGS_PATH}/billing/payers` },
            ]
          : []),
        { icon: <IconReceipt2 />, label: 'Charge Items', href: `${SETTINGS_PATH}/billing/charge-items` },
      ],
    },
    {
      title: 'Schedule',
      links: [
        {
          icon: <IconCalendarCog />,
          label: 'Visit Service Types',
          href: `${SETTINGS_PATH}/schedule/visit-service-types`,
        },
      ],
    },
  ];
}
