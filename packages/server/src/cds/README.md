# CDS Hooks

https://cds-hooks.hl7.org/

## Test with curl

```bash
curl 'http://localhost:8103/cds-services' -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

```bash
curl 'http://localhost:8103/cds-services/1214bc96-58ca-4f05-b160-6c2c826247dd' \
 -X 'POST' \
 -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
 -H 'Content-Type: application/fhir+json' \
 --data-raw '{"foo":"bar"}'
```
