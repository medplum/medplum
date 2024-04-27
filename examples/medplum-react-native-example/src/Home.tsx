import { LoginAuthenticationResponse, getDisplayString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumContext, useMedplumProfile, useSubscription } from '@medplum/react-hooks';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CustomButton from './CustomButton';

export default function Home(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { loading } = useMedplumContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [patients, setPatients] = useState<Patient[]>();
  const [lastName, setLastName] = useState('');

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

  function createNewMary(): void {
    medplum
      .createResource<Patient>({
        resourceType: 'Patient',
        name: [
          {
            family: lastName !== '' ? lastName : 'Doe',
            given: ['Mary'],
          },
        ],
      })
      .then(console.log)
      .catch(console.error);
    setLastName('');
  }

  function searchForMary(): void {
    medplum.searchResources('Patient', 'name=Mary').then(setPatients).catch(console.error);
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
              <View style={styles.marginTop10}>
                <TextInput
                  style={{ ...styles.input, marginTop: 10 }}
                  placeholder="Mary's Last Name"
                  placeholderTextColor="#003f5c"
                  onChangeText={(lastName) => setLastName(lastName)}
                  value={lastName}
                />
                <CustomButton onPress={createNewMary} title="Create New Mary" />
                <CustomButton style={styles.marginTop10} onPress={searchForMary} title="Search for Mary" />
                <ScrollView style={styles.scrollView}>
                  <View style={styles.marginTop10}>
                    {patients &&
                      (patients.length ? (
                        patients.map((patient) => {
                          const lastName = patient.name?.[0]?.family;
                          return (
                            <Text key={patient.id as string} style={styles.name}>
                              Mary {lastName}
                            </Text>
                          );
                        })
                      ) : (
                        <Text>No patients with first name "Mary" found.</Text>
                      ))}
                  </View>
                </ScrollView>
              </View>
              <NotificationsWidgit title="New Marys created:" criteria="Patient?name=Mary" />
            </View>
          )}
          <StatusBar style="auto" />
        </>
      )}
    </View>
  );
}

interface NotificationsWidgitProps {
  title?: string;
  criteria: string;
}

function NotificationsWidgit(props: NotificationsWidgitProps): JSX.Element {
  const [notifications, setNotifications] = useState(0);

  useSubscription(props.criteria, () => {
    setNotifications(notifications + 1);
  });

  function clearNotifications(): void {
    setNotifications(0);
  }

  return (
    <View style={styles.marginTop10}>
      <Text>
        {props.title ?? 'Notifications:'} {notifications}
      </Text>
      <CustomButton onPress={clearNotifications} title="Clear" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
    height: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
  },
  loginText: {
    marginBottom: 10,
    textAlign: 'center',
  },
  formWrapper: {
    marginTop: 10,
  },
  authedWrapper: {
    marginTop: 10,
    height: '60%',
  },
  input: {
    minWidth: 200,
    height: 40,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#ced4da',
    color: '#212529',
    marginBottom: 10,
    borderRadius: 6,
  },
  marginTop10: {
    marginTop: 10,
  },
  scrollView: {
    marginTop: 20,
    width: 250,
    paddingHorizontal: 5,
  },
  name: {
    textAlign: 'center',
    marginBottom: 2,
    color: '#212529',
    borderStyle: 'solid',
    borderColor: '#ced4da',
    borderWidth: 2,
    borderRadius: 5,
    padding: 5,
  },
});
