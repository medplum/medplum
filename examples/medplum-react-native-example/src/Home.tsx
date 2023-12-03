import { LoginAuthenticationResponse, getDisplayString } from '@medplum/core';
import { useMedplum, useMedplumContext, useMedplumProfile } from '@medplum/react-hooks';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import CustomButton from './CustomButton';

export default function Home(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { loading } = useMedplumContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function startLogin(): void {
    medplum.startLogin({ email, password }).then(handleAuthResponse).catch(console.error);
  }

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    if (response.code) {
      medplum.processCode(response.code).catch(console.error);
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

  function signOut(): void {
    medplum.signOut().catch(console.error);
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.title}>Medplum React Native Example</Text>
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
              <CustomButton onPress={startLogin} title="Sign in" />
            </View>
          ) : (
            <View style={styles.authedWrapper}>
              <Text style={styles.loginText}>Logged in as {getDisplayString(profile)}</Text>
              <CustomButton onPress={signOut} title="Sign out" />
            </View>
          )}
          <StatusBar style="auto" />
        </>
      )}
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
  title: {
    fontSize: 18,
    fontWeight: '500',
  },
  loginText: {
    marginBottom: 10,
  },
  formWrapper: {
    marginTop: 10,
  },
  authedWrapper: {
    marginTop: 10,
  },
  input: {
    width: 200,
    height: 40,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#ced4da',
    color: '#212529',
    marginBottom: 10,
    borderRadius: 6,
  },
});
