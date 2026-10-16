## Usage

Once a subscription is created, any newly created or updated resources that meet the criteria in the resource cause a notification to be sent using the provided channel. The criteria are [Search](https://www.hl7.org/fhir/search.html) strings that have the same interpretation as if they were appended to the base URL and submitted using the REST API. Note that the search criteria are applied to the new value of the resource. The consequence of this is that there is no notification when a resource is deleted, or when a resource is updated so that it no longer meets the criteria.

The server is able to send notifications without any information about the matching resource, or with the entire resource.

Several different types of channels are supported:

- **rest-hook**: A post is made to the URL identified in the [Subscription](/docs/api/fhir/resources/subscription) resource. If the subscription requests that the whole resource is included, the URL is interpreted as the service base
- **websocket**: A PING message is sent to the designated URI
- **email/sms**: A notification is sent to the nominated email address or SMS number
- **message**: The resource is sent to the application identified in the URI as a [message](https://www.hl7.org/fhir/messaging.html)

See below for further discussion of the various channels. Note that sending the entire resource creates security concerns that must be managed by the server.

[Subscriptions](/docs/api/fhir/resources/subscription) are active resources; a server can only accept a subscription if it will execute the specified channel for any resources subsequently received. The subscription is no longer active once it is deleted from the server.

## Relationships

As an alternative to subscriptions, the RESTful API describes a polling-based subscription method using [bundles](/docs/api/fhir/resources/bundle) and the [history operation](https://www.hl7.org/fhir/http.html#history). This method of polling allows for a much tighter relationship between the client and the server that doesn't involve missing updates and/or deletes.

When using the `Subscription` resource, the FHIR server combines the roles of publisher and information distributer. Other arrangements of the publish and subscribe pattern describe separate agents for the two roles. Implementers may implement the `Subscription` resource using an architecture with separate agents, or using any other pub/sub architectire (e.g. see [FHIRcast](http://fhircast.org/) , or, more generally, [W3C Pub/Sub](https://www.w3.org/TR/websub/) ).
