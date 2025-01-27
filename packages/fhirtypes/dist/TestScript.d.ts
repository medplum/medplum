/*
 * This is a generated file
 * Do not edit manually.
 */

import { CodeableConcept } from './CodeableConcept';
import { Coding } from './Coding';
import { ContactDetail } from './ContactDetail';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { PrimitiveExtension } from './PrimitiveExtension';
import { Reference } from './Reference';
import { Resource } from './Resource';
import { UsageContext } from './UsageContext';

/**
 * A structured set of tests against a FHIR server or client
 * implementation to determine compliance against the FHIR specification.
 */
export interface TestScript {

  /**
   * This is a TestScript resource
   */
  readonly resourceType: 'TestScript';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  _id?: PrimitiveExtension;

  /**
   * The metadata about the resource. This is content that is maintained by
   * the infrastructure. Changes to the content might not always be
   * associated with version changes to the resource.
   */
  meta?: Meta;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  implicitRules?: string;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  _implicitRules?: PrimitiveExtension;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * The base language in which the resource is written.
   */
  _language?: PrimitiveExtension;

  /**
   * A human-readable narrative that contains a summary of the resource and
   * can be used to represent the content of the resource to a human. The
   * narrative need not encode all the structured data, but is required to
   * contain sufficient detail to make it &quot;clinically safe&quot; for a human to
   * just read the narrative. Resource definitions may define what content
   * should be represented in the narrative to ensure clinical safety.
   */
  text?: Narrative;

  /**
   * These resources do not have an independent existence apart from the
   * resource that contains them - they cannot be identified independently,
   * and nor can they have their own independent transaction scope.
   */
  contained?: Resource[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource and that modifies the
   * understanding of the element that contains it and/or the understanding
   * of the containing element's descendants. Usually modifier elements
   * provide negation or qualification. To make the use of extensions safe
   * and manageable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer is allowed to
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension. Applications processing a
   * resource are required to check for modifier extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * An absolute URI that is used to identify this test script when it is
   * referenced in a specification, model, design or an instance; also
   * called its canonical identifier. This SHOULD be globally unique and
   * SHOULD be a literal address at which at which an authoritative
   * instance of this test script is (or will be) published. This URL can
   * be the target of a canonical reference. It SHALL remain the same when
   * the test script is stored on different servers.
   */
  url: string;

  /**
   * An absolute URI that is used to identify this test script when it is
   * referenced in a specification, model, design or an instance; also
   * called its canonical identifier. This SHOULD be globally unique and
   * SHOULD be a literal address at which at which an authoritative
   * instance of this test script is (or will be) published. This URL can
   * be the target of a canonical reference. It SHALL remain the same when
   * the test script is stored on different servers.
   */
  _url?: PrimitiveExtension;

  /**
   * A formal identifier that is used to identify this test script when it
   * is represented in other formats, or referenced in a specification,
   * model, design or an instance.
   */
  identifier?: Identifier;

  /**
   * The identifier that is used to identify this version of the test
   * script when it is referenced in a specification, model, design or
   * instance. This is an arbitrary value managed by the test script author
   * and is not expected to be globally unique. For example, it might be a
   * timestamp (e.g. yyyymmdd) if a managed version is not available. There
   * is also no expectation that versions can be placed in a
   * lexicographical sequence.
   */
  version?: string;

  /**
   * The identifier that is used to identify this version of the test
   * script when it is referenced in a specification, model, design or
   * instance. This is an arbitrary value managed by the test script author
   * and is not expected to be globally unique. For example, it might be a
   * timestamp (e.g. yyyymmdd) if a managed version is not available. There
   * is also no expectation that versions can be placed in a
   * lexicographical sequence.
   */
  _version?: PrimitiveExtension;

  /**
   * A natural language name identifying the test script. This name should
   * be usable as an identifier for the module by machine processing
   * applications such as code generation.
   */
  name: string;

  /**
   * A natural language name identifying the test script. This name should
   * be usable as an identifier for the module by machine processing
   * applications such as code generation.
   */
  _name?: PrimitiveExtension;

  /**
   * A short, descriptive, user-friendly title for the test script.
   */
  title?: string;

  /**
   * A short, descriptive, user-friendly title for the test script.
   */
  _title?: PrimitiveExtension;

  /**
   * The status of this test script. Enables tracking the life-cycle of the
   * content.
   */
  status: 'draft' | 'active' | 'retired' | 'unknown';

  /**
   * The status of this test script. Enables tracking the life-cycle of the
   * content.
   */
  _status?: PrimitiveExtension;

  /**
   * A Boolean value to indicate that this test script is authored for
   * testing purposes (or education/evaluation/marketing) and is not
   * intended to be used for genuine usage.
   */
  experimental?: boolean;

  /**
   * A Boolean value to indicate that this test script is authored for
   * testing purposes (or education/evaluation/marketing) and is not
   * intended to be used for genuine usage.
   */
  _experimental?: PrimitiveExtension;

  /**
   * The date  (and optionally time) when the test script was published.
   * The date must change when the business version changes and it must
   * change if the status code changes. In addition, it should change when
   * the substantive content of the test script changes.
   */
  date?: string;

  /**
   * The date  (and optionally time) when the test script was published.
   * The date must change when the business version changes and it must
   * change if the status code changes. In addition, it should change when
   * the substantive content of the test script changes.
   */
  _date?: PrimitiveExtension;

  /**
   * The name of the organization or individual that published the test
   * script.
   */
  publisher?: string;

  /**
   * The name of the organization or individual that published the test
   * script.
   */
  _publisher?: PrimitiveExtension;

  /**
   * Contact details to assist a user in finding and communicating with the
   * publisher.
   */
  contact?: ContactDetail[];

  /**
   * A free text natural language description of the test script from a
   * consumer's perspective.
   */
  description?: string;

  /**
   * A free text natural language description of the test script from a
   * consumer's perspective.
   */
  _description?: PrimitiveExtension;

  /**
   * The content was developed with a focus and intent of supporting the
   * contexts that are listed. These contexts may be general categories
   * (gender, age, ...) or may be references to specific programs
   * (insurance plans, studies, ...) and may be used to assist with
   * indexing and searching for appropriate test script instances.
   */
  useContext?: UsageContext[];

  /**
   * A legal or geographic region in which the test script is intended to
   * be used.
   */
  jurisdiction?: CodeableConcept[];

  /**
   * Explanation of why this test script is needed and why it has been
   * designed as it has.
   */
  purpose?: string;

  /**
   * Explanation of why this test script is needed and why it has been
   * designed as it has.
   */
  _purpose?: PrimitiveExtension;

  /**
   * A copyright statement relating to the test script and/or its contents.
   * Copyright statements are generally legal restrictions on the use and
   * publishing of the test script.
   */
  copyright?: string;

  /**
   * A copyright statement relating to the test script and/or its contents.
   * Copyright statements are generally legal restrictions on the use and
   * publishing of the test script.
   */
  _copyright?: PrimitiveExtension;

  /**
   * An abstract server used in operations within this test script in the
   * origin element.
   */
  origin?: TestScriptOrigin[];

  /**
   * An abstract server used in operations within this test script in the
   * destination element.
   */
  destination?: TestScriptDestination[];

  /**
   * The required capability must exist and are assumed to function
   * correctly on the FHIR server being tested.
   */
  metadata?: TestScriptMetadata;

  /**
   * Fixture in the test script - by reference (uri). All fixtures are
   * required for the test script to execute.
   */
  fixture?: TestScriptFixture[];

  /**
   * Reference to the profile to be used for validation.
   */
  profile?: Reference<Resource>[];

  /**
   * Variable is set based either on element value in response body or on
   * header field value in the response headers.
   */
  variable?: TestScriptVariable[];

  /**
   * A series of required setup operations before tests are executed.
   */
  setup?: TestScriptSetup;

  /**
   * A test in this script.
   */
  test?: TestScriptTest[];

  /**
   * A series of operations required to clean up after all the tests are
   * executed (successfully or otherwise).
   */
  teardown?: TestScriptTeardown;
}

/**
 * An abstract server used in operations within this test script in the
 * destination element.
 */
export interface TestScriptDestination {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Abstract name given to a destination server in this test script.  The
   * name is provided as a number starting at 1.
   */
  index: number;

  /**
   * Abstract name given to a destination server in this test script.  The
   * name is provided as a number starting at 1.
   */
  _index?: PrimitiveExtension;

  /**
   * The type of destination profile the test system supports.
   */
  profile: Coding;
}

/**
 * Fixture in the test script - by reference (uri). All fixtures are
 * required for the test script to execute.
 */
export interface TestScriptFixture {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Whether or not to implicitly create the fixture during setup. If true,
   * the fixture is automatically created on each server being tested
   * during setup, therefore no create operation is required for this
   * fixture in the TestScript.setup section.
   */
  autocreate: boolean;

  /**
   * Whether or not to implicitly create the fixture during setup. If true,
   * the fixture is automatically created on each server being tested
   * during setup, therefore no create operation is required for this
   * fixture in the TestScript.setup section.
   */
  _autocreate?: PrimitiveExtension;

  /**
   * Whether or not to implicitly delete the fixture during teardown. If
   * true, the fixture is automatically deleted on each server being tested
   * during teardown, therefore no delete operation is required for this
   * fixture in the TestScript.teardown section.
   */
  autodelete: boolean;

  /**
   * Whether or not to implicitly delete the fixture during teardown. If
   * true, the fixture is automatically deleted on each server being tested
   * during teardown, therefore no delete operation is required for this
   * fixture in the TestScript.teardown section.
   */
  _autodelete?: PrimitiveExtension;

  /**
   * Reference to the resource (containing the contents of the resource
   * needed for operations).
   */
  resource?: Reference<Resource>;
}

/**
 * The required capability must exist and are assumed to function
 * correctly on the FHIR server being tested.
 */
export interface TestScriptMetadata {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * A link to the FHIR specification that this test is covering.
   */
  link?: TestScriptMetadataLink[];

  /**
   * Capabilities that must exist and are assumed to function correctly on
   * the FHIR server being tested.
   */
  capability: TestScriptMetadataCapability[];
}

/**
 * Capabilities that must exist and are assumed to function correctly on
 * the FHIR server being tested.
 */
export interface TestScriptMetadataCapability {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Whether or not the test execution will require the given capabilities
   * of the server in order for this test script to execute.
   */
  required: boolean;

  /**
   * Whether or not the test execution will require the given capabilities
   * of the server in order for this test script to execute.
   */
  _required?: PrimitiveExtension;

  /**
   * Whether or not the test execution will validate the given capabilities
   * of the server in order for this test script to execute.
   */
  validated: boolean;

  /**
   * Whether or not the test execution will validate the given capabilities
   * of the server in order for this test script to execute.
   */
  _validated?: PrimitiveExtension;

  /**
   * Description of the capabilities that this test script is requiring the
   * server to support.
   */
  description?: string;

  /**
   * Description of the capabilities that this test script is requiring the
   * server to support.
   */
  _description?: PrimitiveExtension;

  /**
   * Which origin server these requirements apply to.
   */
  origin?: number[];

  /**
   * Which origin server these requirements apply to.
   */
  _origin?: (PrimitiveExtension | null)[];

  /**
   * Which server these requirements apply to.
   */
  destination?: number;

  /**
   * Which server these requirements apply to.
   */
  _destination?: PrimitiveExtension;

  /**
   * Links to the FHIR specification that describes this interaction and
   * the resources involved in more detail.
   */
  link?: string[];

  /**
   * Links to the FHIR specification that describes this interaction and
   * the resources involved in more detail.
   */
  _link?: (PrimitiveExtension | null)[];

  /**
   * Minimum capabilities required of server for test script to execute
   * successfully.   If server does not meet at a minimum the referenced
   * capability statement, then all tests in this script are skipped.
   */
  capabilities: string;

  /**
   * Minimum capabilities required of server for test script to execute
   * successfully.   If server does not meet at a minimum the referenced
   * capability statement, then all tests in this script are skipped.
   */
  _capabilities?: PrimitiveExtension;
}

/**
 * A link to the FHIR specification that this test is covering.
 */
export interface TestScriptMetadataLink {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * URL to a particular requirement or feature within the FHIR
   * specification.
   */
  url: string;

  /**
   * URL to a particular requirement or feature within the FHIR
   * specification.
   */
  _url?: PrimitiveExtension;

  /**
   * Short description of the link.
   */
  description?: string;

  /**
   * Short description of the link.
   */
  _description?: PrimitiveExtension;
}

/**
 * An abstract server used in operations within this test script in the
 * origin element.
 */
export interface TestScriptOrigin {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Abstract name given to an origin server in this test script.  The name
   * is provided as a number starting at 1.
   */
  index: number;

  /**
   * Abstract name given to an origin server in this test script.  The name
   * is provided as a number starting at 1.
   */
  _index?: PrimitiveExtension;

  /**
   * The type of origin profile the test system supports.
   */
  profile: Coding;
}

/**
 * A series of required setup operations before tests are executed.
 */
export interface TestScriptSetup {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Action would contain either an operation or an assertion.
   */
  action: TestScriptSetupAction[];
}

/**
 * Action would contain either an operation or an assertion.
 */
export interface TestScriptSetupAction {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The operation to perform.
   */
  operation?: TestScriptSetupActionOperation;

  /**
   * Evaluates the results of previous operations to determine if the
   * server under test behaves appropriately.
   */
  assert?: TestScriptSetupActionAssert;
}

/**
 * Evaluates the results of previous operations to determine if the
 * server under test behaves appropriately.
 */
export interface TestScriptSetupActionAssert {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The label would be used for tracking/logging purposes by test engines.
   */
  label?: string;

  /**
   * The label would be used for tracking/logging purposes by test engines.
   */
  _label?: PrimitiveExtension;

  /**
   * The description would be used by test engines for tracking and
   * reporting purposes.
   */
  description?: string;

  /**
   * The description would be used by test engines for tracking and
   * reporting purposes.
   */
  _description?: PrimitiveExtension;

  /**
   * The direction to use for the assertion.
   */
  direction?: 'response' | 'request';

  /**
   * The direction to use for the assertion.
   */
  _direction?: PrimitiveExtension;

  /**
   * Id of the source fixture used as the contents to be evaluated by
   * either the &quot;source/expression&quot; or &quot;sourceId/path&quot; definition.
   */
  compareToSourceId?: string;

  /**
   * Id of the source fixture used as the contents to be evaluated by
   * either the &quot;source/expression&quot; or &quot;sourceId/path&quot; definition.
   */
  _compareToSourceId?: PrimitiveExtension;

  /**
   * The FHIRPath expression to evaluate against the source fixture. When
   * compareToSourceId is defined, either compareToSourceExpression or
   * compareToSourcePath must be defined, but not both.
   */
  compareToSourceExpression?: string;

  /**
   * The FHIRPath expression to evaluate against the source fixture. When
   * compareToSourceId is defined, either compareToSourceExpression or
   * compareToSourcePath must be defined, but not both.
   */
  _compareToSourceExpression?: PrimitiveExtension;

  /**
   * XPath or JSONPath expression to evaluate against the source fixture.
   * When compareToSourceId is defined, either compareToSourceExpression or
   * compareToSourcePath must be defined, but not both.
   */
  compareToSourcePath?: string;

  /**
   * XPath or JSONPath expression to evaluate against the source fixture.
   * When compareToSourceId is defined, either compareToSourceExpression or
   * compareToSourcePath must be defined, but not both.
   */
  _compareToSourcePath?: PrimitiveExtension;

  /**
   * The mime-type contents to compare against the request or response
   * message 'Content-Type' header.
   */
  contentType?: string;

  /**
   * The mime-type contents to compare against the request or response
   * message 'Content-Type' header.
   */
  _contentType?: PrimitiveExtension;

  /**
   * The FHIRPath expression to be evaluated against the request or
   * response message contents - HTTP headers and payload.
   */
  expression?: string;

  /**
   * The FHIRPath expression to be evaluated against the request or
   * response message contents - HTTP headers and payload.
   */
  _expression?: PrimitiveExtension;

  /**
   * The HTTP header field name e.g. 'Location'.
   */
  headerField?: string;

  /**
   * The HTTP header field name e.g. 'Location'.
   */
  _headerField?: PrimitiveExtension;

  /**
   * The ID of a fixture.  Asserts that the response contains at a minimum
   * the fixture specified by minimumId.
   */
  minimumId?: string;

  /**
   * The ID of a fixture.  Asserts that the response contains at a minimum
   * the fixture specified by minimumId.
   */
  _minimumId?: PrimitiveExtension;

  /**
   * Whether or not the test execution performs validation on the bundle
   * navigation links.
   */
  navigationLinks?: boolean;

  /**
   * Whether or not the test execution performs validation on the bundle
   * navigation links.
   */
  _navigationLinks?: PrimitiveExtension;

  /**
   * The operator type defines the conditional behavior of the assert. If
   * not defined, the default is equals.
   */
  operator?: 'equals' | 'notEquals' | 'in' | 'notIn' | 'greaterThan' | 'lessThan' | 'empty' | 'notEmpty' | 'contains' | 'notContains' | 'eval';

  /**
   * The operator type defines the conditional behavior of the assert. If
   * not defined, the default is equals.
   */
  _operator?: PrimitiveExtension;

  /**
   * The XPath or JSONPath expression to be evaluated against the fixture
   * representing the response received from server.
   */
  path?: string;

  /**
   * The XPath or JSONPath expression to be evaluated against the fixture
   * representing the response received from server.
   */
  _path?: PrimitiveExtension;

  /**
   * The request method or HTTP operation code to compare against that used
   * by the client system under test.
   */
  requestMethod?: 'delete' | 'get' | 'options' | 'patch' | 'post' | 'put' | 'head';

  /**
   * The request method or HTTP operation code to compare against that used
   * by the client system under test.
   */
  _requestMethod?: PrimitiveExtension;

  /**
   * The value to use in a comparison against the request URL path string.
   */
  requestURL?: string;

  /**
   * The value to use in a comparison against the request URL path string.
   */
  _requestURL?: PrimitiveExtension;

  /**
   * The type of the resource.  See
   * http://build.fhir.org/resourcelist.html.
   */
  resource?: string;

  /**
   * The type of the resource.  See
   * http://build.fhir.org/resourcelist.html.
   */
  _resource?: PrimitiveExtension;

  /**
   * okay | created | noContent | notModified | bad | forbidden | notFound
   * | methodNotAllowed | conflict | gone | preconditionFailed |
   * unprocessable.
   */
  response?: 'okay' | 'created' | 'noContent' | 'notModified' | 'bad' | 'forbidden' | 'notFound' | 'methodNotAllowed'
      | 'conflict' | 'gone' | 'preconditionFailed' | 'unprocessable';

  /**
   * okay | created | noContent | notModified | bad | forbidden | notFound
   * | methodNotAllowed | conflict | gone | preconditionFailed |
   * unprocessable.
   */
  _response?: PrimitiveExtension;

  /**
   * The value of the HTTP response code to be tested.
   */
  responseCode?: string;

  /**
   * The value of the HTTP response code to be tested.
   */
  _responseCode?: PrimitiveExtension;

  /**
   * Fixture to evaluate the XPath/JSONPath expression or the headerField
   * against.
   */
  sourceId?: string;

  /**
   * Fixture to evaluate the XPath/JSONPath expression or the headerField
   * against.
   */
  _sourceId?: PrimitiveExtension;

  /**
   * The ID of the Profile to validate against.
   */
  validateProfileId?: string;

  /**
   * The ID of the Profile to validate against.
   */
  _validateProfileId?: PrimitiveExtension;

  /**
   * The value to compare to.
   */
  value?: string;

  /**
   * The value to compare to.
   */
  _value?: PrimitiveExtension;

  /**
   * Whether or not the test execution will produce a warning only on error
   * for this assert.
   */
  warningOnly: boolean;

  /**
   * Whether or not the test execution will produce a warning only on error
   * for this assert.
   */
  _warningOnly?: PrimitiveExtension;
}

/**
 * The operation to perform.
 */
export interface TestScriptSetupActionOperation {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Server interaction or operation type.
   */
  type?: Coding;

  /**
   * The type of the resource.  See
   * http://build.fhir.org/resourcelist.html.
   */
  resource?: string;

  /**
   * The type of the resource.  See
   * http://build.fhir.org/resourcelist.html.
   */
  _resource?: PrimitiveExtension;

  /**
   * The label would be used for tracking/logging purposes by test engines.
   */
  label?: string;

  /**
   * The label would be used for tracking/logging purposes by test engines.
   */
  _label?: PrimitiveExtension;

  /**
   * The description would be used by test engines for tracking and
   * reporting purposes.
   */
  description?: string;

  /**
   * The description would be used by test engines for tracking and
   * reporting purposes.
   */
  _description?: PrimitiveExtension;

  /**
   * The mime-type to use for RESTful operation in the 'Accept' header.
   */
  accept?: string;

  /**
   * The mime-type to use for RESTful operation in the 'Accept' header.
   */
  _accept?: PrimitiveExtension;

  /**
   * The mime-type to use for RESTful operation in the 'Content-Type'
   * header.
   */
  contentType?: string;

  /**
   * The mime-type to use for RESTful operation in the 'Content-Type'
   * header.
   */
  _contentType?: PrimitiveExtension;

  /**
   * The server where the request message is destined for.  Must be one of
   * the server numbers listed in TestScript.destination section.
   */
  destination?: number;

  /**
   * The server where the request message is destined for.  Must be one of
   * the server numbers listed in TestScript.destination section.
   */
  _destination?: PrimitiveExtension;

  /**
   * Whether or not to implicitly send the request url in encoded format.
   * The default is true to match the standard RESTful client behavior. Set
   * to false when communicating with a server that does not support
   * encoded url paths.
   */
  encodeRequestUrl: boolean;

  /**
   * Whether or not to implicitly send the request url in encoded format.
   * The default is true to match the standard RESTful client behavior. Set
   * to false when communicating with a server that does not support
   * encoded url paths.
   */
  _encodeRequestUrl?: PrimitiveExtension;

  /**
   * The HTTP method the test engine MUST use for this operation regardless
   * of any other operation details.
   */
  method?: 'delete' | 'get' | 'options' | 'patch' | 'post' | 'put' | 'head';

  /**
   * The HTTP method the test engine MUST use for this operation regardless
   * of any other operation details.
   */
  _method?: PrimitiveExtension;

  /**
   * The server where the request message originates from.  Must be one of
   * the server numbers listed in TestScript.origin section.
   */
  origin?: number;

  /**
   * The server where the request message originates from.  Must be one of
   * the server numbers listed in TestScript.origin section.
   */
  _origin?: PrimitiveExtension;

  /**
   * Path plus parameters after [type].  Used to set parts of the request
   * URL explicitly.
   */
  params?: string;

  /**
   * Path plus parameters after [type].  Used to set parts of the request
   * URL explicitly.
   */
  _params?: PrimitiveExtension;

  /**
   * Header elements would be used to set HTTP headers.
   */
  requestHeader?: TestScriptSetupActionOperationRequestHeader[];

  /**
   * The fixture id (maybe new) to map to the request.
   */
  requestId?: string;

  /**
   * The fixture id (maybe new) to map to the request.
   */
  _requestId?: PrimitiveExtension;

  /**
   * The fixture id (maybe new) to map to the response.
   */
  responseId?: string;

  /**
   * The fixture id (maybe new) to map to the response.
   */
  _responseId?: PrimitiveExtension;

  /**
   * The id of the fixture used as the body of a PUT or POST request.
   */
  sourceId?: string;

  /**
   * The id of the fixture used as the body of a PUT or POST request.
   */
  _sourceId?: PrimitiveExtension;

  /**
   * Id of fixture used for extracting the [id],  [type], and [vid] for GET
   * requests.
   */
  targetId?: string;

  /**
   * Id of fixture used for extracting the [id],  [type], and [vid] for GET
   * requests.
   */
  _targetId?: PrimitiveExtension;

  /**
   * Complete request URL.
   */
  url?: string;

  /**
   * Complete request URL.
   */
  _url?: PrimitiveExtension;
}

/**
 * Header elements would be used to set HTTP headers.
 */
export interface TestScriptSetupActionOperationRequestHeader {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The HTTP header field e.g. &quot;Accept&quot;.
   */
  field: string;

  /**
   * The HTTP header field e.g. &quot;Accept&quot;.
   */
  _field?: PrimitiveExtension;

  /**
   * The value of the header e.g. &quot;application/fhir+xml&quot;.
   */
  value: string;

  /**
   * The value of the header e.g. &quot;application/fhir+xml&quot;.
   */
  _value?: PrimitiveExtension;
}

/**
 * A series of operations required to clean up after all the tests are
 * executed (successfully or otherwise).
 */
export interface TestScriptTeardown {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The teardown action will only contain an operation.
   */
  action: TestScriptTeardownAction[];
}

/**
 * The teardown action will only contain an operation.
 */
export interface TestScriptTeardownAction {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * An operation would involve a REST request to a server.
   */
  operation: TestScriptSetupActionOperation;
}

/**
 * A test in this script.
 */
export interface TestScriptTest {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The name of this test used for tracking/logging purposes by test
   * engines.
   */
  name?: string;

  /**
   * The name of this test used for tracking/logging purposes by test
   * engines.
   */
  _name?: PrimitiveExtension;

  /**
   * A short description of the test used by test engines for tracking and
   * reporting purposes.
   */
  description?: string;

  /**
   * A short description of the test used by test engines for tracking and
   * reporting purposes.
   */
  _description?: PrimitiveExtension;

  /**
   * Action would contain either an operation or an assertion.
   */
  action: TestScriptTestAction[];
}

/**
 * Action would contain either an operation or an assertion.
 */
export interface TestScriptTestAction {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * An operation would involve a REST request to a server.
   */
  operation?: TestScriptSetupActionOperation;

  /**
   * Evaluates the results of previous operations to determine if the
   * server under test behaves appropriately.
   */
  assert?: TestScriptSetupActionAssert;
}

/**
 * Variable is set based either on element value in response body or on
 * header field value in the response headers.
 */
export interface TestScriptVariable {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Descriptive name for this variable.
   */
  name: string;

  /**
   * Descriptive name for this variable.
   */
  _name?: PrimitiveExtension;

  /**
   * A default, hard-coded, or user-defined value for this variable.
   */
  defaultValue?: string;

  /**
   * A default, hard-coded, or user-defined value for this variable.
   */
  _defaultValue?: PrimitiveExtension;

  /**
   * A free text natural language description of the variable and its
   * purpose.
   */
  description?: string;

  /**
   * A free text natural language description of the variable and its
   * purpose.
   */
  _description?: PrimitiveExtension;

  /**
   * The FHIRPath expression to evaluate against the fixture body. When
   * variables are defined, only one of either expression, headerField or
   * path must be specified.
   */
  expression?: string;

  /**
   * The FHIRPath expression to evaluate against the fixture body. When
   * variables are defined, only one of either expression, headerField or
   * path must be specified.
   */
  _expression?: PrimitiveExtension;

  /**
   * Will be used to grab the HTTP header field value from the headers that
   * sourceId is pointing to.
   */
  headerField?: string;

  /**
   * Will be used to grab the HTTP header field value from the headers that
   * sourceId is pointing to.
   */
  _headerField?: PrimitiveExtension;

  /**
   * Displayable text string with hint help information to the user when
   * entering a default value.
   */
  hint?: string;

  /**
   * Displayable text string with hint help information to the user when
   * entering a default value.
   */
  _hint?: PrimitiveExtension;

  /**
   * XPath or JSONPath to evaluate against the fixture body.  When
   * variables are defined, only one of either expression, headerField or
   * path must be specified.
   */
  path?: string;

  /**
   * XPath or JSONPath to evaluate against the fixture body.  When
   * variables are defined, only one of either expression, headerField or
   * path must be specified.
   */
  _path?: PrimitiveExtension;

  /**
   * Fixture to evaluate the XPath/JSONPath expression or the headerField
   * against within this variable.
   */
  sourceId?: string;

  /**
   * Fixture to evaluate the XPath/JSONPath expression or the headerField
   * against within this variable.
   */
  _sourceId?: PrimitiveExtension;
}
