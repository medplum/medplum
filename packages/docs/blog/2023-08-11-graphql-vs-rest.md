# GraphQL vs REST APIs in Medplum

One of the most frequent questions we get from our users is whether they should use Medplum's [REST API]() or [GraphQL](). Both have a FHIR specification, and they offer different tradeoffs for different use cases. 

In this post, we'll go over these tradeoffs and provide some guidance on how you can choose which API is right for you. 

## GraphQL

GraphQL APIs have surged in popularity in recent years. <For those already invested in the GraphQL ecosystem, the ability to integrate other frameworks, such as [Apollo](), is undeniably beneficial>.

In the context of FHIR, one of GraphQL's standout features is the ability to quickly retrieve [multiple linked resources](). While the REST API allows similar functionality using the [`_include`]()  and [`_revinclude`]() directives, GraphQL offers a more natural syntax for querying bundles of resources that reference each other. 

```graphql
```



GraphQL, also offers very fine grained control for developers to select the exact fields returned in a query, which can significantly reduce your app's network traffic. Unlike the REST API, GraphQL lets you select specific fields, even in deeply nested elements, and provides additional filtering functionality through [FHIR Path list filters](). This is particularly advantageous in applications where bandwidth is at a premium, such as in mobile applications. 

<TODO: Example>

When it comes to search, *both* GraphQL and REST support the [`_filter` search parameter](), which allows for some more advanced queries. 

However, GraphQL does have *some* limitations. 

Both GraphQL and REST read/write [multiple resources in a single request](). However, GraphQL mutations don't support 

However, GraphQL isn't without its challenges. For instance, its search specification isn't as detailed as its REST counterpart. The inability to support field-level resource updates, which REST can accomplish via PATCH operations, also marks a limitation. Furthermore, the dynamic nature of GraphQL's response formats, depending on the query, means that developers have to craft custom types instead of the convenience of using predefined types in @medplum/fhirtypes.

## REST 

REST has stood the test of time as an API design cornerstone. Its simplicity and wide-ranging support have made it indispensable, and when utilized in Medplum's REST FHIR API, several advantages come to the fore.

First and foremost is REST's robustness in search specifications. Its arsenal of search modifiers allows for intricate querying capabilities, a feature many developers treasure. Moreover, the support for HTML PATCH operations guarantees targeted field-level resource updates, a feature GraphQL currently lacks.

REST also offers a semblance of field control with the `_elements` search parameter, although it's mainly for top-level fields. But where it truly stands apart is in its advanced batch write capabilities. Features such as `ifNoneExist` for conditional writes and internal reference rewrites give REST an edge. For those wary of type security, REST, by returning full resources, ensures easy integration with predefined types in @medplum/fhirtypes. An additional benefit, especially for those keen on data tracking, is REST's accessibility to the history API.

## Which One Should I Choose?

Your choice between REST and GraphQL will largely hinge on your specific use-case. Here are three potential paths to consider:

**Both (recommended):** For those not committed to a specific toolset, blending the best of both worlds is a viable strategy. By integrating the Medplum Client, you can seamlessly shift between both types of queries, capitalizing on each's strengths, reminiscent of Medplum App's modus operandi.

**GraphQL Only:** This route may appeal to you if you have a penchant for GraphQL-centric tools like Apollo, if your operations are predominantly read-heavy, or if bandwidth conservation is paramount for your application.

**REST API:** Turning towards REST is advisable if your tasks involve complex searches or filters. Similarly, if you often delve into resource history or necessitate targeted updates using PATCH, REST is the way to go. Another scenario where REST shines is in managing extensive bundles of inter-referenced Resources in a single go.

In conclusion, the decision between REST and GraphQL isn't black and white. By grasping the distinct attributes each brings to the table in Medplum's FHIR framework, you can hone in on the optimal tool, ensuring you harness the full potential of healthcare data management in your applications.