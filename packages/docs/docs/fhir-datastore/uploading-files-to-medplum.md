import BrowserOnlyTabs from '@site/src/components/BrowserOnlyTabs';
import TabItem from '@theme/TabItem';

# Upload Files to Medplum

## Upload via URL

For large files such as videos and images, it can be inconvenient to download contents to the client before uploading to Medplum. In these situations, you can create a [`Media`](../api/fhir/resources/media) resource with a `url` parameter pointing to the location of the content.

<BrowserOnlyTabs groupId="language">
  <TabItem value="typescript" label="TypeScript">

```ts
import { Media } from '@medplum/fhirtypes';

// Create a Media Resource
const MEDIA_URL = 'https://images.unsplash.com/photo-1581385339821-5b358673a883';
const media: Media = {
  resourceType: 'Media',
  basedOn: [
    {
      reference: 'ServiceRequest/12345',
    },
  ],
  status: 'completed', // `status` is a required field
  content: {
    title: 'plums-ts.jpg',
    contentType: 'image/jpeg',
    url: MEDIA_URL,
  },
};

await medplum.createResource(media);
```

  </TabItem>
  <TabItem value="python" label="Python">

```py

API_URL = 'https://api.medplum.com/fhir/R4'
MEDIA_URL = 'https://images.unsplash.com/photo-1581385339821-5b358673a883'
media = {
  'resourceType': 'Media',
  'basedOn': [{
    'reference': 'ServiceRequest/12345'
  }],
  'status': 'completed',    # `status` is a required field
  'content': {
    'title': 'plums-python.jpg',
    'contentType': 'image/jpeg',
    'url': MEDIA_URL,
  }
};

requests.post(f'{API_URL}/Media', json=media, headers={
  'Authorization': f'Bearer {auth_token}'
})

```

  </TabItem>
</BrowserOnlyTabs>

See the [**Client Credentials tutorial**](../auth/client-credentials) guide for how to obtain an access token
