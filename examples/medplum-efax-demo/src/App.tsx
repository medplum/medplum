// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconInbox, IconMailForward, IconSend } from '@tabler/icons-react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { FaxInboxPage } from './pages/FaxInboxPage';
import { SendFaxPage } from './pages/SendFaxPage';
import { SentFaxesPage } from './pages/SentFaxesPage';
import { SignInPage } from './pages/SignInPage';

export function App(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Loading />;
  }

  return (
    <AppShell logo={<Logo size={24} />} menus={menus}>
      <Suspense fallback={<Loading />}>
        <Routes>
          {profile ? (
            <>
              <Route path="/" element={<FaxInboxPage />} />
              <Route path="/send" element={<SendFaxPage />} />
              <Route path="/sent" element={<SentFaxesPage />} />
              <Route path="/signin" element={<SignInPage />} />
            </>
          ) : (
            <>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="*" element={<Navigate to="/signin" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </AppShell>
  );
}

const menus = [
  {
    title: 'eFax',
    links: [
      { icon: <IconInbox />, label: 'Inbox', href: '/' },
      { icon: <IconMailForward />, label: 'Sent', href: '/sent' },
      { icon: <IconSend />, label: 'Send Fax', href: '/send' },
    ],
  },
];
