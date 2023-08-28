import { getDisplayString, MedplumClient } from "@medplum/core";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { TextInput } from "react-native-web";

const medplum = new MedplumClient({
  // Enter your Medplum connection details here
  // See MedplumClient docs for more details
  // baseUrl: "http://localhost:8103/",
  // clientId: 'MY_CLIENT_ID',
  // projectId: 'MY_PROJECT_ID',
});

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(undefined);

  function startLogin() {
    medplum.startLogin({ email, password }).then(handleAuthResponse);
  }

  function handleAuthResponse(response) {
    if (response.code) {
      handleCode(response.code);
    }
    if (response.memberships) {
      // TODO: Handle multiple memberships
      // In a real app, you would present a list of memberships to the user
      // For this example, just use the first membership
      medplum
        .post("auth/profile", {
          login: response.login,
          profile: response.memberships[0].id,
        })
        .then(handleAuthResponse);
    }
  }

  function handleCode(code) {
    medplum.processCode(code).then(setProfile);
  }

  function signOut() {
    setProfile(undefined);
    medplum.signOut();
  }

  return (
    <View style={styles.container}>
      <Text>Medplum React Native Example</Text>
      {!profile ? (
        <>
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
        </>
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
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  input: {
    height: 50,
    flex: 1,
    padding: 10,
    marginLeft: 20,
  },
});
