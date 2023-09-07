# Medplum HL7

This implements "HL7 over HTTP" as described here: https://hapifhir.github.io/hapi-hl7v2/hapi-hl7overhttp/specification.html

## Implementation Notes

HL7 v2.x in ER7 (pipe delimited) format is the only supported encoding.

HL7 parsing is not "strict", similar to Mirth in non-strict mode.

- One HTTP request represents one HL7 message
- A `Message` is represented as an array of `Segment` objects
- Each `Segment` is represented as an array of `Field` objects
- Each `Field` is an array of components
- All components are naively represented as strings

### Content Type

Request Content-Type is not validated. "x-application/hl7-v2+er7" is recommended.

Response Content-Type will always be "x-application/hl7-v2+er7"

### Character Set

All requests and responses are handled as UTF8.

### Line Endings

Request line endings can be CR (\r), LF (\n), or CRLF (\r\n). CR is recommended.

Response line endings will always be CR.

## Security Profile

We use Security Profile Level 2:

- HTTPS/TLS only
- Client authentication is required using standard Medplum authentication (Basic or Bearer)
