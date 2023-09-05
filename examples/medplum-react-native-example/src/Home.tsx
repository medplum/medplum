import { LoginAuthenticationResponse, ProfileResource, getDisplayString } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

export default function Home(): JSX.Element {
  const medplum = useMedplum();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<ProfileResource | undefined>(undefined);

  function startLogin(): void {
    medplum.startLogin({ email, password }).then(handleAuthResponse).catch(console.error);
  }

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    if (response.code) {
      handleCode(response.code);
    }
    if (response.memberships) {
      // TODO: Handle multiple memberships
      // In a real app, you would present a list of memberships to the user
      // For this example, just use the first membership
      medplum
        .post('auth/profile', {
          login: response.login,
          profile: response.memberships[0].id,
        })
        .then(handleAuthResponse)
        .catch(console.error);
    }
  }

  function handleCode(code: string): void {
    medplum.processCode(code).then(setProfile).catch(console.error);
  }

  function signOut(): void {
    setProfile(undefined);
    medplum.signOut().catch(console.error);
  }

  return (
    <View style={styles.container}>
      <Text>Medplum React Native Example</Text>
      {!profile ? (
        <View style={styles.formWrapper}>
          <View>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#003f5c"
              onChangeText={(email) => setEmail(email)}
            />
          </View>
          <View>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#003f5c"
              secureTextEntry={true}
              onChangeText={(password) => setPassword(password)}
            />
          </View>
          <Button onPress={startLogin} title="Sign in" />
        </View>
      ) : (
        <>
          <Text>Logged in as {getDisplayString(profile)}</Text>
          <Button onPress={signOut} title="Sign out" />
        </>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
  },
  formWrapper: {
    marginTop: 10,
  },
  input: {
    width: 200,
    height: 44,
    padding: 10,
    borderWidth: 1,
    borderColor: 'black',
    marginBottom: 10,
  },
});
