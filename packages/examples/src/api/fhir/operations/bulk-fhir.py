import http.client
import time
import json

# You'll need to go through the auth process to get a valid access token,
# see https://www.medplum.com/docs/auth/client-credentials for details
access_token = '[Requires valid access token]'

# Open the connection to the Medplum API
conn = http.client.HTTPSConnection('api.medplum.com')

# Start the bulk export by calling the POST [base]/$export operation endpoint
# This begins the export process, which runs asynchronouosly and may take a while
# to finish.  Because of this, the response to this API call does not contain the
# actual exported data, but instead a URL that you can poll to get the status of
# the export operation
conn.request(
  'GET', '/fhir/R4/$export', None, {
    'Authorization': 'Bearer ' + access_token,
    'Content-Type': 'application/fhir+json',
  })
init = conn.getresponse()

# No 202 Accepted status code means the export request was not successfully started
if init.status != 202:
  raise RuntimeError('Failed to start bulk export')

# Get the status URL from the Content-Location header
status_url = init.getheader('Content-Location')
if status_url == None:
  raise RuntimeError('No status URL found')

# Make an initial request for the status of the export
conn.request(
  'GET', status_url, None, {
    'Authorization': 'Bearer ' + access_token,
  })
status = conn.getresponse()

# 202 Accepted status code means the export is still in progress
while status.status == 202:
  # Wait 1s between requests
  time.sleep(1)

  # Retry checking the status
  conn.request(
    'GET', status_url, None, {
      'Authorization': 'Bearer ' + access_token,
    })
  status = conn.getresponse()

# No 200 OK status code means the export failed with an error
if status.status != 200:
  raise RuntimeError('Error exporting data')

# Read the JSON body of the response
body = status.read()
export = json.loads(body)

# The response JSON looks like this:
# {
#   "transactionTime": "2023-01-01T00:00:00Z",
#   "request" : "https://app.medplum.com/fhir/R4/$export
#   "requiresAccessToken" : true,
#   "output" : [{
#     "type" : "Patient",
#     "url" : "http://url.to.storage/patient_file_1.ndjson"
#   },{
#     "type" : "Observation",
#     "url" : "http://url.to.storage/observation_file_1.ndjson"
#   }],
#   "error" : []
# }
def download_export_to_file(export_record, access_token):
  # Request the NDJSON export data
  conn.request(
    'GET', export_record.url, None, {
      'Authorization': 'Bearer ' + access_token,
    })
  export_data = conn.getresponse()

  # Append NDJSON data to file on disk
  with open(export_record.type + '.ndjson', 'a') as f:
    f.write(export_data.read())

# Iterate over the output items to download the exported data
for record in export.output:
  # record.type: the resource type contained in the export file
  # record.url: a URL pointing to an NDJSON file containing the exported data
  download_export_to_file(record, access_token)
