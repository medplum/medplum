import { AppShell, Burger, Container, Group, Menu, UnstyledButton, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ResourceAvatar, useMedplumProfile } from '@medplum/react';
import { IconChevronDown, IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react';
import cx from 'clsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classes from './Header.module.css';
import { Logo } from './Logo';

const navigation = [
  { name: 'Health Record', href: '/health-record' },
  { name: 'Messages', href: '/messages' },
  { name: 'Care Plan', href: '/care-plan' },
  { name: 'Get Care', href: '/get-care' },
];

export function Header(): JSX.Element {
  const navigate = useNavigate();
  const profile = useMedplumProfile();
  const theme = useMantineTheme();
  const [opened, { toggle }] = useDisclosure(false);
  const [userMenuOpened, setUserMenuOpened] = useState(false);

  return (
    <AppShell.Header>
      <Container>
        <div className={classes.inner}>
          <UnstyledButton className={classes.logoButton} onClick={() => navigate('/')}>
            <Logo width={240} />
          </UnstyledButton>
          <Group gap={5} className={classes.links}>
            {navigation.map((link) => (
              <Link key={link.name} to={link.href} className={classes.link}>
                {link.name}
              </Link>
            ))}
          </Group>
          <Menu
            width={260}
            shadow="xl"
            position="bottom-end"
            transitionProps={{ transition: 'pop-top-right' }}
            onClose={() => setUserMenuOpened(false)}
            onOpen={() => setUserMenuOpened(true)}
          >
            <Menu.Target>
              <UnstyledButton className={cx(classes.user, { [classes.userActive]: userMenuOpened })}>
                <Group gap={7}>
                  <ResourceAvatar radius="xl" value={profile} />
                  <IconChevronDown size={12} stroke={1.5} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconUserCircle size={16} color={theme.colors.red[6]} stroke={1.5} />}
                onClick={() => navigate('/account/profile')}
              >
                Your profile
              </Menu.Item>
              <Menu.Item
                leftSection={<IconSettings size={16} color={theme.colors.blue[6]} stroke={1.5} />}
                onClick={() => navigate('/account/profile')}
              >
                Settings
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLogout size={16} color={theme.colors.gray[6]} stroke={1.5} />}
                onClick={() => navigate('/signout')}
              >
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Burger opened={opened} onClick={toggle} className={classes.burger} size="sm" />
        </div>
      </Container>
    </AppShell.Header>
  );
}
