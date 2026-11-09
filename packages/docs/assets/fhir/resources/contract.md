## Usage

This resource allows for the instantiation of various types of legally enforceable agreements or policies as shareable, consumable, and executable artifacts as well as precursory content upon which instances may be based or derivative artifacts supporting management of their basal instance. The resource is general enough to encode broad range of legal artifacts such as:

- A [Contract](/docs/api/fhir/resources/contract) instance, which may undergo legal state transitions during its formation.
- Templates for or agreed upon instances of rules, obligations, and prohibitions.
- An organizational or jurisdictional policy, for example, for establishing rules of conduct or obligations necessary to achieve societal goods. Or it may encode a contract instance, which may be accepted by one party in exchange of considerations offered by another party.
- A derivative of a contract instance for purposes of workflow management of the agreement, e.g., for retrieval or indication of agreed upon terms, such as entities allowed to exchange governed assets.

Contracts are promises or understandings that are enforceable by law in case of any violation or breech by any involved party or organization. A [Contract](/docs/api/fhir/resources/contract) instance may be a unilateral mandate such as a policy, or a unilateral, bilateral, or multilateral agreement, which impacts the influence of the parties over the terms of the agreement, and the burdens and risks incurred.

Contract Resource may be typed to support multiple types of domain policies and contractual agreements, and specializations of those types.

A [Contract](/docs/api/fhir/resources/contract) instance must include at least one term with an offer, which obligates the offerer to or not to do, perform, or effectuate some action in exchange for some consideration in return from the offeree, e.g., another obligatory action or non-action, or an asset.

The [Contract](/docs/api/fhir/resources/contract) action element follows the Request Pattern to describe the proposal, plan, or order to effectuate the obligatory service or activity specified in a term’s offer. The [Contract](/docs/api/fhir/resources/contract) action may reference and specify the roles for one or more target entities, the requesters, and performers. By following the Request Pattern, the [Contract](/docs/api/fhir/resources/contract) provides the criteria needed to assess whether the contract obligations have been enforced, for example, in the case of a privacy policy, by an access control system.

The [Contract](/docs/api/fhir/resources/contract) asset element supports detailed description of the consideration being exchanged in a [Contract](/docs/api/fhir/resources/contract) instance or the satisfaction of a policy imperative such as the obligation to render aid as required by local law.

The [Contract](/docs/api/fhir/resources/contract) valuedItem element supports detailed description of the monetary worth of a [Contract](/docs/api/fhir/resources/contract) asset being marketed, the price of products being sold, or the property taxes required under a jurisdictional tax law.

A [Contract](/docs/api/fhir/resources/contract) may be used as a content derivative, which contains the minimal content derived from the basal information source at a specific stage in its lifecycle, which is needed for management and communications about the basal information source. For example, the metadata used to register a [Contract](/docs/api/fhir/resources/contract)’s characteristics and retrieval address in a federated registry/repository exchange ecosystem.

In addition to other uses of derivatives, the [Contract](/docs/api/fhir/resources/contract) Resource may function simply as the computable representation of the executed contract, which may be the attached to the [Contract](/docs/api/fhir/resources/contract) Resource as the 'legally binding' scanned paper contract attachment or referenced location, or as the 'friendly' electronic form such as an html page or a [QuestionnaireResponse](/docs/api/fhir/resources/questionnaireresponse).

By using the [Contract](/docs/api/fhir/resources/contract) linkID elements, which are associated with key [Contract](/docs/api/fhir/resources/contract) elements, a [Contract](/docs/api/fhir/resources/contract) Resource may be automatically populated with the values expressed in a related [QuestionnaireResponse](/docs/api/fhir/resources/questionnaireresponse).

Note that the [Contract](/docs/api/fhir/resources/contract) Resource may be considered the legally binding contract only if it is intended to be the sole 'executed' encoding of this contract, and includes the legally binding signatures. I.e., even if the [Contract](/docs/api/fhir/resources/contract) Resource is populated based on content in a hard-copy contract or an electronic contract form intended to collect both the content and the signature of relevant parties to the contract, if contracting parties have agreed or acknowledged that the [Contract](/docs/api/fhir/resources/contract) Resource conveys the binding and enforceable legal contract and that it is fully traceable to the forms used to collect its content, meeting the legal concept of being within the 'four corners of a contract', i.e., that the meaning of the contract, will, or deed is represented solely by this instance of the [Contract](/docs/api/fhir/resources/contract) Resource. This usage could be implemented with digital ledger technology to form a 'smart contract' to the extent that an instance supports elements critical to computable algorithms intended to achieve some output.

Where the [Consent](/docs/api/fhir/resources/consent) resource applies, the [Consent](/docs/api/fhir/resources/consent) resource should be used. Where a [Contract](/docs/api/fhir/resources/contract) exists for a consent directive then if a [Consent](/docs/api/fhir/resources/consent) for this also exists the [Consent](/docs/api/fhir/resources/consent) shall reference the [Contract](/docs/api/fhir/resources/contract).

## Relationships

- Contracts are used to record in machine processible form a legal agreement between parties

## Background and Context

Implementers should be familiar with legal concepts, [Ricardian](http://iang.org/papers/ricardian_contract.html) [Contracts](/docs/api/fhir/resources/contract) and have a general knowledge of recording agreements.

#### Legal State Machine[](https://www.hl7.org/fhir/contract.html#13.11.3.1 'link to here')

This Resource supports tracking of the progress of a [Contract](/docs/api/fhir/resources/contract) instance during its lifecycle as a 'legal instrument' from inception as a draft, possibly based on a definitional contract template to negotiations and the various permutation on term elements that may occur, on to execution. Then it follows the [Contract](/docs/api/fhir/resources/contract) as enforceable obligations, which may be breached, disputed, or modified, until the [Contract](/docs/api/fhir/resources/contract) reaches renewal, termination, or revocation. This is flow is orthogonal to the [Contract](/docs/api/fhir/resources/contract).status, which tracks the progress of the documentation of the [Contract](/docs/api/fhir/resources/contract) whether it is definitional, a derivative, or an instance. The legal state value set specifies the characteristics of these states based on legal definitions.
