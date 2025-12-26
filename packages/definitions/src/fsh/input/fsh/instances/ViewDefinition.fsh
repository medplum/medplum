Instance: ViewDefinition
InstanceOf: StructureDefinition
Usage: #inline
* url = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* version = "0.0.1-pre"
* name = "ViewDefinition"
* title = "View Definition"
* status = #draft
* date = "2024-06-11T00:39:12+00:00"
* publisher = "HL7"
* contact.name = "HL7"
* contact.telecom.system = #url
* contact.telecom.value = "http://example.org/example-publisher"
* description = "View definitions represent a tabular projection of a FHIR resource, where the columns and inclusion \ncriteria are defined by FHIRPath expressions. "
* jurisdiction = $m49.htm#001 "World"
* fhirVersion = #5.0.0
* mapping.identity = "rim"
* mapping.uri = "http://hl7.org/v3"
* mapping.name = "RIM Mapping"
* kind = #logical
* abstract = false
* type = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/Base"
* derivation = #specialization
* snapshot.element[0].id = "ViewDefinition"
* snapshot.element[=].path = "ViewDefinition"
* snapshot.element[=].short = "View Definition"
* snapshot.element[=].definition = "View definitions represent a tabular projection of a FHIR resource, where the columns and inclusion \ncriteria are defined by FHIRPath expressions. "
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Base"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].isModifier = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.url"
* snapshot.element[=].path = "ViewDefinition.url"
* snapshot.element[=].short = "Canonical identifier for this view definition, represented as a URI (globally unique)"
* snapshot.element[=].definition = "Canonical identifier for this view definition, represented as a URI (globally unique)"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.url"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "ViewDefinition.identifier"
* snapshot.element[=].path = "ViewDefinition.identifier"
* snapshot.element[=].short = "Additional identifier for the view definition"
* snapshot.element[=].definition = "Additional identifier for the view definition"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[+].id = "ViewDefinition.name"
* snapshot.element[=].path = "ViewDefinition.name"
* snapshot.element[=].short = "Name of view definition (computer and database friendly)"
* snapshot.element[=].definition = "Name of the view definition, must be in a database-friendly format."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].constraint.key = "sql-name"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* snapshot.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* snapshot.element[+].id = "ViewDefinition.title"
* snapshot.element[=].path = "ViewDefinition.title"
* snapshot.element[=].short = "Name for this view definition (human friendly)"
* snapshot.element[=].definition = "A optional human-readable description of the view."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.title"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.meta"
* snapshot.element[=].path = "ViewDefinition.meta"
* snapshot.element[=].short = "Metadata about the view definition"
* snapshot.element[=].definition = "Metadata about the view definition"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "ViewDefinition.status"
* snapshot.element[=].path = "ViewDefinition.status"
* snapshot.element[=].short = "draft | active | retired | unknown"
* snapshot.element[=].definition = "draft | active | retired | unknown"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.status"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/publication-status"
* snapshot.element[+].id = "ViewDefinition.experimental"
* snapshot.element[=].path = "ViewDefinition.experimental"
* snapshot.element[=].short = "For testing purposes, not real usage"
* snapshot.element[=].definition = "For testing purposes, not real usage"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.experimental"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[+].id = "ViewDefinition.publisher"
* snapshot.element[=].path = "ViewDefinition.publisher"
* snapshot.element[=].short = "Name of the publisher/steward (organization or individual)"
* snapshot.element[=].definition = "Name of the publisher/steward (organization or individual)"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.publisher"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.contact"
* snapshot.element[=].path = "ViewDefinition.contact"
* snapshot.element[=].short = "Contact details for the publisher"
* snapshot.element[=].definition = "Contact details for the publisher"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.contact"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "ContactDetail"
* snapshot.element[+].id = "ViewDefinition.description"
* snapshot.element[=].path = "ViewDefinition.description"
* snapshot.element[=].short = "Natural language description of the view definition"
* snapshot.element[=].definition = "Natural language description of the view definition"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "markdown"
* snapshot.element[+].id = "ViewDefinition.useContext"
* snapshot.element[=].path = "ViewDefinition.useContext"
* snapshot.element[=].short = "The context that the content is intended to support"
* snapshot.element[=].definition = "The context that the content is intended to support"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.useContext"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "UsageContext"
* snapshot.element[+].id = "ViewDefinition.copyright"
* snapshot.element[=].path = "ViewDefinition.copyright"
* snapshot.element[=].short = "Use and/or publishing restrictions"
* snapshot.element[=].definition = "Use and/or publishing restrictions"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.copyright"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "markdown"
* snapshot.element[+].id = "ViewDefinition.resource"
* snapshot.element[=].path = "ViewDefinition.resource"
* snapshot.element[=].short = "FHIR resource for the ViewDefinition"
* snapshot.element[=].definition = "The FHIR resource that the view is based upon, e.g. 'Patient' or 'Observation'."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.resource"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types"
* snapshot.element[+].id = "ViewDefinition.fhirVersion"
* snapshot.element[=].path = "ViewDefinition.fhirVersion"
* snapshot.element[=].short = "FHIR version(s) of the resource for the ViewDefinition"
* snapshot.element[=].definition = "The FHIR version(s) for the FHIR resource. The value of this element is the\nformal version of the specification, without the revision number, e.g.\n[publication].[major].[minor]."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.fhirVersion"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/FHIR-version"
* snapshot.element[+].id = "ViewDefinition.constant"
* snapshot.element[=].path = "ViewDefinition.constant"
* snapshot.element[=].short = "Constant that can be used in FHIRPath expressions"
* snapshot.element[=].definition = "A constant is a value that is injected into a FHIRPath expression through the use of a FHIRPath\nexternal constant with the same name."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.constant"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].constraint.key = "ele-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint.expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[+].id = "ViewDefinition.constant.id"
* snapshot.element[=].path = "ViewDefinition.constant.id"
* snapshot.element[=].representation = #xmlAttr
* snapshot.element[=].short = "Unique id for inter-element referencing"
* snapshot.element[=].definition = "Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Element.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.extension.url = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type"
* snapshot.element[=].type.extension.valueUrl = "id"
* snapshot.element[=].type.code = "http://hl7.org/fhirpath/System.String"
* snapshot.element[=].condition = "ele-1"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.constant.extension"
* snapshot.element[=].path = "ViewDefinition.constant.extension"
* snapshot.element[=].slicing.discriminator.type = #value
* snapshot.element[=].slicing.discriminator.path = "url"
* snapshot.element[=].slicing.description = "Extensions are always sliced by (at least) url"
* snapshot.element[=].slicing.rules = #open
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Element.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.constant.modifierExtension"
* snapshot.element[=].path = "ViewDefinition.constant.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored even if unrecognized"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].requirements = "Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](http://hl7.org/fhir/R5/extensibility.html#modifierExtension)."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].alias[+] = "modifiers"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BackboneElement.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = true
* snapshot.element[=].isModifierReason = "Modifier extensions are expected to modify the meaning or interpretation of the element that contains them"
* snapshot.element[=].isSummary = true
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "N/A"
* snapshot.element[+].id = "ViewDefinition.constant.name"
* snapshot.element[=].path = "ViewDefinition.constant.name"
* snapshot.element[=].short = "Name of constant (referred to in FHIRPath as %[name])"
* snapshot.element[=].definition = "Name of constant (referred to in FHIRPath as %[name])"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.constant.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].constraint.key = "sql-name"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* snapshot.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* snapshot.element[+].id = "ViewDefinition.constant.value[x]"
* snapshot.element[=].path = "ViewDefinition.constant.value[x]"
* snapshot.element[=].short = "Value of constant"
* snapshot.element[=].definition = "The value that will be substituted in place of the constant reference. This\nis done by including `%your_constant_name` in a FHIRPath expression, which effectively converts\nthe FHIR literal defined here to a FHIRPath literal used in the path expression.\n\nSupport for additional types may be added in the future."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.constant.value[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type[0].code = "base64Binary"
* snapshot.element[=].type[+].code = "boolean"
* snapshot.element[=].type[+].code = "canonical"
* snapshot.element[=].type[+].code = "code"
* snapshot.element[=].type[+].code = "date"
* snapshot.element[=].type[+].code = "dateTime"
* snapshot.element[=].type[+].code = "decimal"
* snapshot.element[=].type[+].code = "id"
* snapshot.element[=].type[+].code = "instant"
* snapshot.element[=].type[+].code = "integer"
* snapshot.element[=].type[+].code = "integer64"
* snapshot.element[=].type[+].code = "oid"
* snapshot.element[=].type[+].code = "string"
* snapshot.element[=].type[+].code = "positiveInt"
* snapshot.element[=].type[+].code = "time"
* snapshot.element[=].type[+].code = "unsignedInt"
* snapshot.element[=].type[+].code = "uri"
* snapshot.element[=].type[+].code = "url"
* snapshot.element[=].type[+].code = "uuid"
* snapshot.element[+].id = "ViewDefinition.select"
* snapshot.element[=].path = "ViewDefinition.select"
* snapshot.element[=].short = "A collection of columns and nested selects to include in the view."
* snapshot.element[=].definition = "The select structure defines the columns to be used in the resulting view. These are expressed\nin the `column` structure below, or in nested `select`s for nested resources."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.select"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].constraint[0].key = "sql-expressions"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Can only have at most one of `forEach` or `forEachOrNull`."
* snapshot.element[=].constraint[=].expression = "(forEach | forEachOrNull).count() <= 1"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* snapshot.element[=].constraint[+].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[+].id = "ViewDefinition.select.id"
* snapshot.element[=].path = "ViewDefinition.select.id"
* snapshot.element[=].representation = #xmlAttr
* snapshot.element[=].short = "Unique id for inter-element referencing"
* snapshot.element[=].definition = "Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Element.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.extension.url = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type"
* snapshot.element[=].type.extension.valueUrl = "id"
* snapshot.element[=].type.code = "http://hl7.org/fhirpath/System.String"
* snapshot.element[=].condition = "ele-1"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.extension"
* snapshot.element[=].path = "ViewDefinition.select.extension"
* snapshot.element[=].slicing.discriminator.type = #value
* snapshot.element[=].slicing.discriminator.path = "url"
* snapshot.element[=].slicing.description = "Extensions are always sliced by (at least) url"
* snapshot.element[=].slicing.rules = #open
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Element.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.modifierExtension"
* snapshot.element[=].path = "ViewDefinition.select.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored even if unrecognized"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].requirements = "Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](http://hl7.org/fhir/R5/extensibility.html#modifierExtension)."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].alias[+] = "modifiers"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BackboneElement.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = true
* snapshot.element[=].isModifierReason = "Modifier extensions are expected to modify the meaning or interpretation of the element that contains them"
* snapshot.element[=].isSummary = true
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "N/A"
* snapshot.element[+].id = "ViewDefinition.select.column"
* snapshot.element[=].path = "ViewDefinition.select.column"
* snapshot.element[=].short = "A column to be produced in the resulting table."
* snapshot.element[=].definition = "A column to be produced in the resulting table. The column is relative to the select structure\nthat contains it."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.select.column"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].constraint.key = "ele-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint.expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[+].id = "ViewDefinition.select.column.id"
* snapshot.element[=].path = "ViewDefinition.select.column.id"
* snapshot.element[=].representation = #xmlAttr
* snapshot.element[=].short = "Unique id for inter-element referencing"
* snapshot.element[=].definition = "Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Element.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.extension.url = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type"
* snapshot.element[=].type.extension.valueUrl = "id"
* snapshot.element[=].type.code = "http://hl7.org/fhirpath/System.String"
* snapshot.element[=].condition = "ele-1"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.column.extension"
* snapshot.element[=].path = "ViewDefinition.select.column.extension"
* snapshot.element[=].slicing.discriminator.type = #value
* snapshot.element[=].slicing.discriminator.path = "url"
* snapshot.element[=].slicing.description = "Extensions are always sliced by (at least) url"
* snapshot.element[=].slicing.rules = #open
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Element.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.column.modifierExtension"
* snapshot.element[=].path = "ViewDefinition.select.column.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored even if unrecognized"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].requirements = "Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](http://hl7.org/fhir/R5/extensibility.html#modifierExtension)."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].alias[+] = "modifiers"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BackboneElement.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = true
* snapshot.element[=].isModifierReason = "Modifier extensions are expected to modify the meaning or interpretation of the element that contains them"
* snapshot.element[=].isSummary = true
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "N/A"
* snapshot.element[+].id = "ViewDefinition.select.column.path"
* snapshot.element[=].path = "ViewDefinition.select.column.path"
* snapshot.element[=].short = "FHIRPath expression that creates a column and defines its content"
* snapshot.element[=].definition = "A FHIRPath expression that evaluates to the value that will be output in the column for each \nresource. The input context is the collection of resources of the type specified in the resource \nelement. Constants defined in Reference({constant}) can be referenced as %[name]."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.path"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.select.column.name"
* snapshot.element[=].path = "ViewDefinition.select.column.name"
* snapshot.element[=].short = "Column name produced in the output"
* snapshot.element[=].definition = "Name of the column produced in the output, must be in a database-friendly format. The column \nnames in the output must not have any duplicates."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].constraint.key = "sql-name"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* snapshot.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* snapshot.element[+].id = "ViewDefinition.select.column.description"
* snapshot.element[=].path = "ViewDefinition.select.column.description"
* snapshot.element[=].short = "Description of the column"
* snapshot.element[=].definition = "A human-readable description of the column."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "markdown"
* snapshot.element[+].id = "ViewDefinition.select.column.collection"
* snapshot.element[=].path = "ViewDefinition.select.column.collection"
* snapshot.element[=].short = "Indicates whether the column may have multiple values."
* snapshot.element[=].definition = "Indicates whether the column may have multiple values. Defaults to `false` if unset.\n\nViewDefinitions must have this set to `true` if multiple values may be returned. Implementations SHALL\nreport an error if multiple values are produced when that is not the case."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.collection"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[+].id = "ViewDefinition.select.column.type"
* snapshot.element[=].path = "ViewDefinition.select.column.type"
* snapshot.element[=].short = "A FHIR StructureDefinition URI for the column's type."
* snapshot.element[=].definition = "A FHIR StructureDefinition URI for the column's type. Relative URIs are implicitly given\nthe 'http://hl7.org/fhir/StructureDefinition/' prefix. The URI may also use FHIR element ID notation to indicate\na backbone element within a structure. For instance, `Observation.referenceRange` may be specified to indicate\nthe returned type is that backbone element.\n\nThis field *must* be provided if a ViewDefinition returns a non-primitive type. Implementations should report an error\nif the returned type does not match the type set here, or if a non-primitive type is returned but this field is unset."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.type"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "ViewDefinition.select.column.tag"
* snapshot.element[=].path = "ViewDefinition.select.column.tag"
* snapshot.element[=].short = "Additional metadata describing the column"
* snapshot.element[=].definition = "Tags can be used to attach additional metadata to columns, such as implementation-specific \ndirectives or database-specific type hints."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.select.column.tag"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].constraint.key = "ele-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint.expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[+].id = "ViewDefinition.select.column.tag.id"
* snapshot.element[=].path = "ViewDefinition.select.column.tag.id"
* snapshot.element[=].representation = #xmlAttr
* snapshot.element[=].short = "Unique id for inter-element referencing"
* snapshot.element[=].definition = "Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Element.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.extension.url = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type"
* snapshot.element[=].type.extension.valueUrl = "id"
* snapshot.element[=].type.code = "http://hl7.org/fhirpath/System.String"
* snapshot.element[=].condition = "ele-1"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.column.tag.extension"
* snapshot.element[=].path = "ViewDefinition.select.column.tag.extension"
* snapshot.element[=].slicing.discriminator.type = #value
* snapshot.element[=].slicing.discriminator.path = "url"
* snapshot.element[=].slicing.description = "Extensions are always sliced by (at least) url"
* snapshot.element[=].slicing.rules = #open
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Element.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.select.column.tag.modifierExtension"
* snapshot.element[=].path = "ViewDefinition.select.column.tag.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored even if unrecognized"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].requirements = "Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](http://hl7.org/fhir/R5/extensibility.html#modifierExtension)."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].alias[+] = "modifiers"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BackboneElement.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = true
* snapshot.element[=].isModifierReason = "Modifier extensions are expected to modify the meaning or interpretation of the element that contains them"
* snapshot.element[=].isSummary = true
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "N/A"
* snapshot.element[+].id = "ViewDefinition.select.column.tag.name"
* snapshot.element[=].path = "ViewDefinition.select.column.tag.name"
* snapshot.element[=].short = "Name of tag"
* snapshot.element[=].definition = "A name that identifies the meaning of the tag. A namespace should be used to scope the tag to \na particular context. For example, 'ansi/type' could be used to indicate the type that should \nbe used to represent the value within an ANSI SQL database."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.tag.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.select.column.tag.value"
* snapshot.element[=].path = "ViewDefinition.select.column.tag.value"
* snapshot.element[=].short = "Value of tag"
* snapshot.element[=].definition = "Value of tag"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.column.tag.value"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.select.select"
* snapshot.element[=].path = "ViewDefinition.select.select"
* snapshot.element[=].short = "Nested select relative to a parent expression."
* snapshot.element[=].definition = "Nested select relative to a parent expression. If the parent `select` has a `forEach` or `forEachOrNull`, this child select will apply for each item in that expression."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.select.select"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].contentReference = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition#ViewDefinition.select"
* snapshot.element[+].id = "ViewDefinition.select.forEach"
* snapshot.element[=].path = "ViewDefinition.select.forEach"
* snapshot.element[=].short = "A FHIRPath expression to retrieve the parent element(s) used in the containing select. The default is effectively `$this`."
* snapshot.element[=].definition = "A FHIRPath expression to retrieve the parent element(s) used in the containing select, relative to the root resource or parent `select`,\nif applicable. `forEach` will produce a row for each element selected in the expression. For example, using forEach on `address` in Patient will\ngenerate a new row for each address, with columns defined in the corresponding `column` structure."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.forEach"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.select.forEachOrNull"
* snapshot.element[=].path = "ViewDefinition.select.forEachOrNull"
* snapshot.element[=].short = "Same as forEach, but will produce a row with null values if the collection is empty."
* snapshot.element[=].definition = "Same as forEach, but produces a single row with null values in the nested expression if the collection is empty. For example,\nwith a Patient resource, a `forEachOrNull` on address will produce a row for each patient even if there are no addresses; it will\nsimply set the address columns to `null`."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.select.forEachOrNull"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.select.unionAll"
* snapshot.element[=].path = "ViewDefinition.select.unionAll"
* snapshot.element[=].short = "Creates a union of all rows in the given selection structures."
* snapshot.element[=].definition = "A `unionAll` combines the results of multiple selection structures. Each structure under the `unionAll` must produce the same column names\nand types. The results from each nested selection will then have their own row."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.select.unionAll"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].contentReference = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition#ViewDefinition.select"
* snapshot.element[+].id = "ViewDefinition.where"
* snapshot.element[=].path = "ViewDefinition.where"
* snapshot.element[=].short = "A series of zero or more FHIRPath constraints to filter resources for the view."
* snapshot.element[=].definition = "A series of zero or more FHIRPath constraints to filter resources for the view. Every constraint\nmust evaluate to true for the resource to be included in the view."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ViewDefinition.where"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].constraint.key = "ele-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint.expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint.source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[+].id = "ViewDefinition.where.id"
* snapshot.element[=].path = "ViewDefinition.where.id"
* snapshot.element[=].representation = #xmlAttr
* snapshot.element[=].short = "Unique id for inter-element referencing"
* snapshot.element[=].definition = "Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Element.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.extension.url = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type"
* snapshot.element[=].type.extension.valueUrl = "id"
* snapshot.element[=].type.code = "http://hl7.org/fhirpath/System.String"
* snapshot.element[=].condition = "ele-1"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.where.extension"
* snapshot.element[=].path = "ViewDefinition.where.extension"
* snapshot.element[=].slicing.discriminator.type = #value
* snapshot.element[=].slicing.discriminator.path = "url"
* snapshot.element[=].slicing.description = "Extensions are always sliced by (at least) url"
* snapshot.element[=].slicing.rules = #open
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Element.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = false
* snapshot.element[=].isSummary = false
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "n/a"
* snapshot.element[+].id = "ViewDefinition.where.modifierExtension"
* snapshot.element[=].path = "ViewDefinition.where.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored even if unrecognized"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and managable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].comment = "There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone."
* snapshot.element[=].requirements = "Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](http://hl7.org/fhir/R5/extensibility.html#modifierExtension)."
* snapshot.element[=].alias[0] = "extensions"
* snapshot.element[=].alias[+] = "user content"
* snapshot.element[=].alias[+] = "modifiers"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BackboneElement.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[=].constraint[0].key = "ele-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "All FHIR elements must have a @value or children"
* snapshot.element[=].constraint[=].expression = "hasValue() or (children().count() > id.count())"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Element"
* snapshot.element[=].constraint[+].key = "ext-1"
* snapshot.element[=].constraint[=].severity = #error
* snapshot.element[=].constraint[=].human = "Must have either extensions or value[x], not both"
* snapshot.element[=].constraint[=].expression = "extension.exists() != value.exists()"
* snapshot.element[=].constraint[=].source = "http://hl7.org/fhir/StructureDefinition/Extension"
* snapshot.element[=].isModifier = true
* snapshot.element[=].isModifierReason = "Modifier extensions are expected to modify the meaning or interpretation of the element that contains them"
* snapshot.element[=].isSummary = true
* snapshot.element[=].mapping.identity = "rim"
* snapshot.element[=].mapping.map = "N/A"
* snapshot.element[+].id = "ViewDefinition.where.path"
* snapshot.element[=].path = "ViewDefinition.where.path"
* snapshot.element[=].short = "A FHIRPath expression defining a filter condition"
* snapshot.element[=].definition = "A FHIRPath expression that defines a filter that must evaluate to true for a resource to be\nincluded in the output. The input context is the collection of resources of the type specified in\nthe resource element. Constants defined in Reference({constant}) can be referenced as %[name]."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.where.path"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ViewDefinition.where.description"
* snapshot.element[=].path = "ViewDefinition.where.description"
* snapshot.element[=].short = "A human-readable description of the above where constraint."
* snapshot.element[=].definition = "A human-readable description of the above where constraint."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ViewDefinition.where.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* differential.element[0].id = "ViewDefinition"
* differential.element[=].path = "ViewDefinition"
* differential.element[=].short = "View Definition"
* differential.element[=].definition = "View definitions represent a tabular projection of a FHIR resource, where the columns and inclusion \ncriteria are defined by FHIRPath expressions. "
* differential.element[+].id = "ViewDefinition.url"
* differential.element[=].path = "ViewDefinition.url"
* differential.element[=].short = "Canonical identifier for this view definition, represented as a URI (globally unique)"
* differential.element[=].definition = "Canonical identifier for this view definition, represented as a URI (globally unique)"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "uri"
* differential.element[+].id = "ViewDefinition.identifier"
* differential.element[=].path = "ViewDefinition.identifier"
* differential.element[=].short = "Additional identifier for the view definition"
* differential.element[=].definition = "Additional identifier for the view definition"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "Identifier"
* differential.element[+].id = "ViewDefinition.name"
* differential.element[=].path = "ViewDefinition.name"
* differential.element[=].short = "Name of view definition (computer and database friendly)"
* differential.element[=].definition = "Name of the view definition, must be in a database-friendly format."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[=].constraint.key = "sql-name"
* differential.element[=].constraint.severity = #error
* differential.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* differential.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* differential.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* differential.element[+].id = "ViewDefinition.title"
* differential.element[=].path = "ViewDefinition.title"
* differential.element[=].short = "Name for this view definition (human friendly)"
* differential.element[=].definition = "A optional human-readable description of the view."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.meta"
* differential.element[=].path = "ViewDefinition.meta"
* differential.element[=].short = "Metadata about the view definition"
* differential.element[=].definition = "Metadata about the view definition"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "Meta"
* differential.element[+].id = "ViewDefinition.status"
* differential.element[=].path = "ViewDefinition.status"
* differential.element[=].short = "draft | active | retired | unknown"
* differential.element[=].definition = "draft | active | retired | unknown"
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "code"
* differential.element[=].binding.strength = #required
* differential.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/publication-status"
* differential.element[+].id = "ViewDefinition.experimental"
* differential.element[=].path = "ViewDefinition.experimental"
* differential.element[=].short = "For testing purposes, not real usage"
* differential.element[=].definition = "For testing purposes, not real usage"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "boolean"
* differential.element[+].id = "ViewDefinition.publisher"
* differential.element[=].path = "ViewDefinition.publisher"
* differential.element[=].short = "Name of the publisher/steward (organization or individual)"
* differential.element[=].definition = "Name of the publisher/steward (organization or individual)"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.contact"
* differential.element[=].path = "ViewDefinition.contact"
* differential.element[=].short = "Contact details for the publisher"
* differential.element[=].definition = "Contact details for the publisher"
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "ContactDetail"
* differential.element[+].id = "ViewDefinition.description"
* differential.element[=].path = "ViewDefinition.description"
* differential.element[=].short = "Natural language description of the view definition"
* differential.element[=].definition = "Natural language description of the view definition"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "markdown"
* differential.element[+].id = "ViewDefinition.useContext"
* differential.element[=].path = "ViewDefinition.useContext"
* differential.element[=].short = "The context that the content is intended to support"
* differential.element[=].definition = "The context that the content is intended to support"
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "UsageContext"
* differential.element[+].id = "ViewDefinition.copyright"
* differential.element[=].path = "ViewDefinition.copyright"
* differential.element[=].short = "Use and/or publishing restrictions"
* differential.element[=].definition = "Use and/or publishing restrictions"
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "markdown"
* differential.element[+].id = "ViewDefinition.resource"
* differential.element[=].path = "ViewDefinition.resource"
* differential.element[=].short = "FHIR resource for the ViewDefinition"
* differential.element[=].definition = "The FHIR resource that the view is based upon, e.g. 'Patient' or 'Observation'."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "code"
* differential.element[=].binding.strength = #required
* differential.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types"
* differential.element[+].id = "ViewDefinition.fhirVersion"
* differential.element[=].path = "ViewDefinition.fhirVersion"
* differential.element[=].short = "FHIR version(s) of the resource for the ViewDefinition"
* differential.element[=].definition = "The FHIR version(s) for the FHIR resource. The value of this element is the\nformal version of the specification, without the revision number, e.g.\n[publication].[major].[minor]."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "code"
* differential.element[=].binding.strength = #required
* differential.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/FHIR-version"
* differential.element[+].id = "ViewDefinition.constant"
* differential.element[=].path = "ViewDefinition.constant"
* differential.element[=].short = "Constant that can be used in FHIRPath expressions"
* differential.element[=].definition = "A constant is a value that is injected into a FHIRPath expression through the use of a FHIRPath\nexternal constant with the same name."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "BackboneElement"
* differential.element[+].id = "ViewDefinition.constant.name"
* differential.element[=].path = "ViewDefinition.constant.name"
* differential.element[=].short = "Name of constant (referred to in FHIRPath as %[name])"
* differential.element[=].definition = "Name of constant (referred to in FHIRPath as %[name])"
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[=].constraint.key = "sql-name"
* differential.element[=].constraint.severity = #error
* differential.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* differential.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* differential.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* differential.element[+].id = "ViewDefinition.constant.value[x]"
* differential.element[=].path = "ViewDefinition.constant.value[x]"
* differential.element[=].short = "Value of constant"
* differential.element[=].definition = "The value that will be substituted in place of the constant reference. This\nis done by including `%your_constant_name` in a FHIRPath expression, which effectively converts\nthe FHIR literal defined here to a FHIRPath literal used in the path expression.\n\nSupport for additional types may be added in the future."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type[0].code = "base64Binary"
* differential.element[=].type[+].code = "boolean"
* differential.element[=].type[+].code = "canonical"
* differential.element[=].type[+].code = "code"
* differential.element[=].type[+].code = "date"
* differential.element[=].type[+].code = "dateTime"
* differential.element[=].type[+].code = "decimal"
* differential.element[=].type[+].code = "id"
* differential.element[=].type[+].code = "instant"
* differential.element[=].type[+].code = "integer"
* differential.element[=].type[+].code = "integer64"
* differential.element[=].type[+].code = "oid"
* differential.element[=].type[+].code = "string"
* differential.element[=].type[+].code = "positiveInt"
* differential.element[=].type[+].code = "time"
* differential.element[=].type[+].code = "unsignedInt"
* differential.element[=].type[+].code = "uri"
* differential.element[=].type[+].code = "url"
* differential.element[=].type[+].code = "uuid"
* differential.element[+].id = "ViewDefinition.select"
* differential.element[=].path = "ViewDefinition.select"
* differential.element[=].short = "A collection of columns and nested selects to include in the view."
* differential.element[=].definition = "The select structure defines the columns to be used in the resulting view. These are expressed\nin the `column` structure below, or in nested `select`s for nested resources."
* differential.element[=].min = 1
* differential.element[=].max = "*"
* differential.element[=].type.code = "BackboneElement"
* differential.element[=].constraint.key = "sql-expressions"
* differential.element[=].constraint.severity = #error
* differential.element[=].constraint.human = "Can only have at most one of `forEach` or `forEachOrNull`."
* differential.element[=].constraint.expression = "(forEach | forEachOrNull).count() <= 1"
* differential.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* differential.element[+].id = "ViewDefinition.select.column"
* differential.element[=].path = "ViewDefinition.select.column"
* differential.element[=].short = "A column to be produced in the resulting table."
* differential.element[=].definition = "A column to be produced in the resulting table. The column is relative to the select structure\nthat contains it."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "BackboneElement"
* differential.element[+].id = "ViewDefinition.select.column.path"
* differential.element[=].path = "ViewDefinition.select.column.path"
* differential.element[=].short = "FHIRPath expression that creates a column and defines its content"
* differential.element[=].definition = "A FHIRPath expression that evaluates to the value that will be output in the column for each \nresource. The input context is the collection of resources of the type specified in the resource \nelement. Constants defined in Reference({constant}) can be referenced as %[name]."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.select.column.name"
* differential.element[=].path = "ViewDefinition.select.column.name"
* differential.element[=].short = "Column name produced in the output"
* differential.element[=].definition = "Name of the column produced in the output, must be in a database-friendly format. The column \nnames in the output must not have any duplicates."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[=].constraint.key = "sql-name"
* differential.element[=].constraint.severity = #error
* differential.element[=].constraint.human = "Name is limited to letters, numbers, or underscores and cannot start with an\nunderscore -- i.e. with a regular expression of: ^[A-Za-z][A-Za-z0-9_]*$ \n\n\nThis makes it usable as table names in a wide variety of databases."
* differential.element[=].constraint.expression = "empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')"
* differential.element[=].constraint.source = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition"
* differential.element[+].id = "ViewDefinition.select.column.description"
* differential.element[=].path = "ViewDefinition.select.column.description"
* differential.element[=].short = "Description of the column"
* differential.element[=].definition = "A human-readable description of the column."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "markdown"
* differential.element[+].id = "ViewDefinition.select.column.collection"
* differential.element[=].path = "ViewDefinition.select.column.collection"
* differential.element[=].short = "Indicates whether the column may have multiple values."
* differential.element[=].definition = "Indicates whether the column may have multiple values. Defaults to `false` if unset.\n\nViewDefinitions must have this set to `true` if multiple values may be returned. Implementations SHALL\nreport an error if multiple values are produced when that is not the case."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "boolean"
* differential.element[+].id = "ViewDefinition.select.column.type"
* differential.element[=].path = "ViewDefinition.select.column.type"
* differential.element[=].short = "A FHIR StructureDefinition URI for the column's type."
* differential.element[=].definition = "A FHIR StructureDefinition URI for the column's type. Relative URIs are implicitly given\nthe 'http://hl7.org/fhir/StructureDefinition/' prefix. The URI may also use FHIR element ID notation to indicate\na backbone element within a structure. For instance, `Observation.referenceRange` may be specified to indicate\nthe returned type is that backbone element.\n\nThis field *must* be provided if a ViewDefinition returns a non-primitive type. Implementations should report an error\nif the returned type does not match the type set here, or if a non-primitive type is returned but this field is unset."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "uri"
* differential.element[+].id = "ViewDefinition.select.column.tag"
* differential.element[=].path = "ViewDefinition.select.column.tag"
* differential.element[=].short = "Additional metadata describing the column"
* differential.element[=].definition = "Tags can be used to attach additional metadata to columns, such as implementation-specific \ndirectives or database-specific type hints."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "BackboneElement"
* differential.element[+].id = "ViewDefinition.select.column.tag.name"
* differential.element[=].path = "ViewDefinition.select.column.tag.name"
* differential.element[=].short = "Name of tag"
* differential.element[=].definition = "A name that identifies the meaning of the tag. A namespace should be used to scope the tag to \na particular context. For example, 'ansi/type' could be used to indicate the type that should \nbe used to represent the value within an ANSI SQL database."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.select.column.tag.value"
* differential.element[=].path = "ViewDefinition.select.column.tag.value"
* differential.element[=].short = "Value of tag"
* differential.element[=].definition = "Value of tag"
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.select.select"
* differential.element[=].path = "ViewDefinition.select.select"
* differential.element[=].short = "Nested select relative to a parent expression."
* differential.element[=].definition = "Nested select relative to a parent expression. If the parent `select` has a `forEach` or `forEachOrNull`, this child select will apply for each item in that expression. "
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].contentReference = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition#ViewDefinition.select"
* differential.element[+].id = "ViewDefinition.select.forEach"
* differential.element[=].path = "ViewDefinition.select.forEach"
* differential.element[=].short = "A FHIRPath expression to retrieve the parent element(s) used in the containing select. The default is effectively `$this`."
* differential.element[=].definition = "A FHIRPath expression to retrieve the parent element(s) used in the containing select, relative to the root resource or parent `select`,\nif applicable. `forEach` will produce a row for each element selected in the expression. For example, using forEach on `address` in Patient will\ngenerate a new row for each address, with columns defined in the corresponding `column` structure."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.select.forEachOrNull"
* differential.element[=].path = "ViewDefinition.select.forEachOrNull"
* differential.element[=].short = "Same as forEach, but will produce a row with null values if the collection is empty."
* differential.element[=].definition = "Same as forEach, but produces a single row with null values in the nested expression if the collection is empty. For example,\nwith a Patient resource, a `forEachOrNull` on address will produce a row for each patient even if there are no addresses; it will\nsimply set the address columns to `null`."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.select.unionAll"
* differential.element[=].path = "ViewDefinition.select.unionAll"
* differential.element[=].short = "Creates a union of all rows in the given selection structures."
* differential.element[=].definition = "A `unionAll` combines the results of multiple selection structures. Each structure under the `unionAll` must produce the same column names\nand types. The results from each nested selection will then have their own row."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].contentReference = "http://hl7.org/fhir/uv/sql-on-fhir/StructureDefinition/ViewDefinition#ViewDefinition.select"
* differential.element[+].id = "ViewDefinition.where"
* differential.element[=].path = "ViewDefinition.where"
* differential.element[=].short = "A series of zero or more FHIRPath constraints to filter resources for the view."
* differential.element[=].definition = "A series of zero or more FHIRPath constraints to filter resources for the view. Every constraint\nmust evaluate to true for the resource to be included in the view."
* differential.element[=].min = 0
* differential.element[=].max = "*"
* differential.element[=].type.code = "BackboneElement"
* differential.element[+].id = "ViewDefinition.where.path"
* differential.element[=].path = "ViewDefinition.where.path"
* differential.element[=].short = "A FHIRPath expression defining a filter condition"
* differential.element[=].definition = "A FHIRPath expression that defines a filter that must evaluate to true for a resource to be\nincluded in the output. The input context is the collection of resources of the type specified in\nthe resource element. Constants defined in Reference({constant}) can be referenced as %[name]."
* differential.element[=].min = 1
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"
* differential.element[+].id = "ViewDefinition.where.description"
* differential.element[=].path = "ViewDefinition.where.description"
* differential.element[=].short = "A human-readable description of the above where constraint."
* differential.element[=].definition = "A human-readable description of the above where constraint."
* differential.element[=].min = 0
* differential.element[=].max = "1"
* differential.element[=].type.code = "string"