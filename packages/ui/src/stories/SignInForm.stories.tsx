import { Meta } from '@storybook/react';
import React from 'react';
import { Button } from '../Button';
import { Document } from '../Document';
import { FooterLinks } from '../FooterLinks';
import { useMedplumContext } from '../MedplumProvider';
import { SignInForm } from '../SignInForm';

export default {
  title: 'Medplum/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic() {
  const ctx = useMedplumContext();
  return (
    <Document width={450}>
      {ctx.user ? (
        <div>
          <pre>User: {JSON.stringify(ctx.user)}</pre>
          <Button onClick={() => ctx.medplum.signOut().then(() => alert('Signed out!'))}>
            Sign out
          </Button>
        </div>
      ) : (
        <SignInForm onSuccess={() => alert('Signed in!')} />
      )}
    </Document>
  );
}

export function WithLinks() {
  const ctx = useMedplumContext();
  return (
    <Document width={450}>
      {ctx.user ? (
        <div>
          <pre>User: {JSON.stringify(ctx.user)}</pre>
          <Button onClick={() => ctx.medplum.signOut().then(() => alert('Signed out!'))}>
            Sign out
          </Button>
        </div>
      ) : (
        <SignInForm
          onSuccess={() => alert('Signed in!')}
          onForgotPassword={() => alert('Forgot password')}
          onRegister={() => alert('Register')}
        />
      )}
    </Document>
  );
}

export function WithFooter() {
  const ctx = useMedplumContext();
  return (
    <>
      <Document width={450}>
        {ctx.user ? (
          <div>
            <pre>User: {JSON.stringify(ctx.user)}</pre>
            <Button onClick={() => ctx.medplum.signOut().then(() => alert('Signed out!'))}>
              Sign out
            </Button>
          </div>
        ) : (
          <SignInForm
            onSuccess={() => alert('Signed in!')}
            onForgotPassword={() => alert('Forgot password')}
            onRegister={() => alert('Register')}
          />
        )}
      </Document>
      <FooterLinks>
        <a href="#">Help</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
      </FooterLinks>
    </>
  );
}

export function WithGoogle() {
  const ctx = useMedplumContext();
  return (
    <>
      <Document width={450}>
        {ctx.user ? (
          <div>
            <pre>User: {JSON.stringify(ctx.user)}</pre>
            <Button onClick={() => ctx.medplum.signOut().then(() => alert('Signed out!'))}>
              Sign out
            </Button>
          </div>
        ) : (
          <SignInForm
            onSuccess={() => alert('Signed in!')}
            onForgotPassword={() => alert('Forgot password')}
            onRegister={() => alert('Register')}
            googleClientId="xyz"
          />
        )}
      </Document>
      <FooterLinks>
        <a href="#">Help</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
      </FooterLinks>
    </>
  );
}
