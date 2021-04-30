import React from 'react';
import { auth } from 'medplum';

export class AuthProvider extends React.Component {

  render() {
    if (window.location.pathname === '/signout') {
      auth.signOut();
      window.location.href = '/';
      return null;
    }

    if (!auth.isSignedIn()) {
      return <div>Signing in...</div>
    }

    return <>{this.props.children}</>
  }

  componentDidMount() {
    console.log('sign in ...');
    auth.signIn();
  }
}
