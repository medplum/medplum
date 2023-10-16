## Instructions for using the Postman Medplum API collection:

1. Register a new Medplum account using an email address and password:
   https://app.medplum.com/signin?project=new

2. Follow the instructions here to create a new client application:
   https://www.medplum.com/docs/auth/methods/oauth-auth-code

3. Import the `medplum.postman_environment.json` file into Postman

4. In the `Medplum` environment you just imported, set the `client_id` and `client_secret`, and then click save. You can retrieve these values by clicking on the Client Application you created here:
   <br><br>
   https://app.medplum.com/admin/clients
   <br><br>
   Then once on the `Edit membership` page, click the name again and use the values for `ID` and `Secret`.

5. Import the `medplum.postman_collection.json` file into Postman.

6. Within the Medplum collection you just imported, call the `Set Access Token` endpoint. This will retrieve your access token and save it as an environment variable, so that it can be used in the Authorization header for all subsequent endpoint calls.

The endpoints in this collection correspond with the example API calls from the `Browse Sample Data` tutorial:

https://www.medplum.com/docs/tutorials/browse-sample-data
