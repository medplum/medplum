import { Container, Group } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { SideMenu } from '../../components/SideMenu';

const sideMenu = {
  title: 'Account',
  menu: [
    { name: 'Profile', href: '/account/profile' },
    { name: 'Provider', href: '/account/provider' },
    { name: 'Membership & Billing', href: '/account/membership-and-billing' },
  ],
};

export function AccountPage(): JSX.Element {
  return (
    <Container>
      <Group align="top">
        <SideMenu {...sideMenu} />
        <div style={{ width: 800, flex: 800 }}>
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
