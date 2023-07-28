import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Project Sites Endpoint

## POST `/admin/projects/:projectId/sites`

Overwrites project-level site configurations stored in `Project.site`.

### Parameters

```ts
{

  /**
   * Friendly name that will make it easy for you to identify the site in
   * the future.
   */
  name?: string;

  /**
   * The list of domain names associated with the site. User authentication
   * will be restricted to the domains you enter here, plus any subdomains.
   * In other words, a registration for example.com also registers
   * subdomain.example.com. A valid domain requires a host and must not
   * include any path, port, query or fragment.
   */
  domain?: string[];

  /**
   * The publicly visible Google Client ID for the site. This is used to
   * authenticate users with Google. This value is available in the Google
   * Developer Console.
   */
  googleClientId?: string;

  /**
   * The private Google Client Secret for the site. This value is available
   * in the Google Developer Console.
   */
  googleClientSecret?: string;

  /**
   * The publicly visible reCAPTCHA site key. This value is generated when
   * you create a new reCAPTCHA site in the reCAPTCHA admin console. Use
   * this site key in the HTML code your site serves to users.
   */
  recaptchaSiteKey?: string;

  /**
   * The private reCAPTCHA secret key. This value is generated when you
   * create a new reCAPTCHA site in the reCAPTCHA admin console. Use this
   * secret key for communication between your site and reCAPTCHA.
   */
  recaptchaSecretKey?: string;
}[]
```

### Example request

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post(`admin/projects/:projectId/sites`, [
  {
    name: 'localhost',
    domain: ['localhost'],
  },
  {
    name: 'Foo Medical.io',
    domain: ['foomedical.io'],
    googleClientId: '12345',
    googleClientSecret: 'abcdefg',
    recaptchaSiteKey: '98765',
    recaptchaSecretKey: 'zyxwvut',
  },
]);
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum post admin/projects/:projectId/sites \
'[
  {
    "name": "localhost",
    "domain": [
      "localhost"
    ]
  },
  {
    "name": "Foo Medical.io",
    "domain": [
      "foomedical.io"
    ],
    "googleClientId": "12345",
    "googleClientSecret": "abcdefg",
    "recaptchaSiteKey": "98765",
    "recaptchaSecretKey": "zyxwvut"
  }
]'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
  {
    "name": "localhost",
    "domain": [
      "localhost"
    ]
  },
  {
    "name": "Foo Medical.io",
    "domain": [
      "foomedical.io"
    ],
    "googleClientId": "12345",
    "googleClientSecret": "abcdefg",
    "recaptchaSiteKey": "98765",
    "recaptchaSecretKey": "zyxwvut"
  }
]'
```

  </TabItem>
</Tabs>

### Example Response

Returns the updated [`Project`](/docs/api/fhir/medplum/project) resource

```ts
{
  resourceType: 'Project',
  id: ':projectId',
  // ...
  site: [
    { name: 'localhost', domain: [ 'localhost' ] },
    {
      name: 'Foo Medical.io',
      domain: [ 'foomedical.io' ],
      googleClientId: '12345',
      googleClientSecret: 'abcdefg',
      recaptchaSiteKey: '98765',
      recaptchaSecretKey: 'zyxwvut'
    }
  ]
}
```

## See Also

- [Google Authentication](/docs/auth/google-auth#add-google-client-id-to-your-project)
