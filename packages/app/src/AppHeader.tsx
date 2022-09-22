import { Burger, createStyles, Group, Header, Menu, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatHumanName, ProfileResource } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { ResourceAvatar } from '@medplum/react';
import {
  IconChevronDown,
  IconHeart,
  IconLogout,
  IconMessage,
  IconSettings,
  IconStar,
  IconSwitchHorizontal,
} from '@tabler/icons';
import React, { useState } from 'react';
import { MedplumLogo } from './components/MedplumLogo';

const useStyles = createStyles((theme) => ({
  user: {
    padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
    borderRadius: theme.radius.sm,
    transition: 'background-color 100ms ease',

    '&:hover': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background as string,
        0.1
      ),
    },

    [theme.fn.smallerThan('xs')]: {
      display: 'none',
    },
  },

  burger: {
    [theme.fn.largerThan('xs')]: {
      display: 'none',
    },
  },

  userActive: {
    backgroundColor: theme.fn.lighten(
      theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background as string,
      0.1
    ),
  },
}));

interface HeaderTabsProps {
  profile: ProfileResource;
}

export function AppHeader({ profile }: HeaderTabsProps): JSX.Element {
  const { classes, theme, cx } = useStyles();
  const [opened, { toggle }] = useDisclosure(false);
  const [userMenuOpened, setUserMenuOpened] = useState(false);

  return (
    <Header height={60}>
      <Group position="apart">
        <MedplumLogo style={{ width: 120 }} />

        <Burger opened={opened} onClick={toggle} className={classes.burger} size="sm" color={theme.white} />

        <Menu
          width={260}
          position="bottom-end"
          transition="pop-top-right"
          onClose={() => setUserMenuOpened(false)}
          onOpen={() => setUserMenuOpened(true)}
        >
          <Menu.Target>
            <UnstyledButton className={cx(classes.user, { [classes.userActive]: userMenuOpened })}>
              <Group spacing={7}>
                <ResourceAvatar value={profile} radius="xl" size={24} />
                <Text weight={500} size="sm" sx={{ lineHeight: 1 }} mr={3}>
                  {formatHumanName(profile.name?.[0] as HumanName)}
                </Text>
                <IconChevronDown size={12} stroke={1.5} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item icon={<IconHeart size={14} stroke={1.5} color={theme.colors.red[6]} />}>Liked posts</Menu.Item>
            <Menu.Item icon={<IconStar size={14} stroke={1.5} color={theme.colors.yellow[6]} />}>Saved posts</Menu.Item>
            <Menu.Item icon={<IconMessage size={14} stroke={1.5} color={theme.colors.blue[6]} />}>
              Your comments
            </Menu.Item>

            <Menu.Label>Settings</Menu.Label>
            <Menu.Item icon={<IconSettings size={14} stroke={1.5} />}>Account settings</Menu.Item>
            <Menu.Item icon={<IconSwitchHorizontal size={14} stroke={1.5} />}>Change account</Menu.Item>
            <Menu.Item icon={<IconLogout size={14} stroke={1.5} />}>Logout</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Header>
  );
}
