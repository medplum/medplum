# medplum-react-native-example

This is a basic starter app that demonstrates how to sign into Medplum with React Native.

This only demonstrates React Native in "web" mode. Android and iOS are out of scope.

## Setup

To clone and run this project:

```bash
git clone git@github.com:medplum/medplum-react-native-example.git
cd medplum-react-native-example
npm ci
npm run web
```

## Medplum Login

This app includes a very basic sign-in form that only supports email and password. Medplum authentication supports many additional features, which are out of scope of this project (multiple profiles, SMART scopes, federated identities, external auth providers, etc).

### MedplumClient

First, we setup `MedplumClient` which is the Medplum API client:

```js
import { getDisplayString, MedplumClient } from "@medplum/core";

const medplum = new MedplumClient();
```

`MedplumClient` supports many configuration options which control the behavior. For example, you may want to specify a `clientId` and/or `projectId` to restrict access to specific Medplum projects. Or you may want to specify `baseUrl` to specify your self-hosted Medplum server.

### Login form

Next, we define a very simple email and password login form:

```jsx
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

// ...

return (
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
);
```

### Sign in button

Clicking on the "Sign in" button will executes the `startLogin` function:

```js
function startLogin() {
  medplum.startLogin({ email, password }).then(handleAuthResponse);
}
```

### Sign in response

There are two successful response types from `startLogin`:

1. If the user only has one matching profile, the response includes `code` for OAuth token exchange.
2. If the user has multiple profiles, the response includes `memberships` with project membership and profile details.

In this example, we forcefully choose the first profile. In a real app, you would specify a `projectId` to force a single profile, or display a list of profiles to the user.

```js
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
```

### Token exchange

Now that we have a `code`, we can follow OAuth token exchange. Call `processCode` to exchange the `code` for an access token:

```js
function handleCode(code) {
  medplum.processCode(code).then(setProfile);
}
```

`processCode` sets the access token in `MedplumClient` and returns the user's profile resource.

### Display the profile

Now that we have the user's profile, we can display it in the app:

```jsx
<>
  <Text>Logged in as {getDisplayString(profile)}</Text>
  <Button onPress={signOut} title="Sign out" />
</>
```

## Create from scratch

This project was created by following the React Native docs on [Setting up the development environment](Setting up the development environment).

If you want to create a project like this from scratch, follow these instructions.

First, create a React Native project:

```bash
npx create-expo-app medplum-react-native-example
cd medplum-react-native-example
```

Next, add the web dependencies:

```bash
npx expo install react-native-web@~0.18.10 react-dom@18.2.0 @expo/webpack-config@^18.0.1
```

Then add Medplum:

```bash
npx expo install @medplum/core
```

And then start the app:

```bash
npx expo start
```
