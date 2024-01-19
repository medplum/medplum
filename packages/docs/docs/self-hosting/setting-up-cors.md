# Setting Up CORS

When self-hosting, you may run into a CORS error when trying to run your app on https://localhost:3000. If you do, you will need to ensure that you have set https://localhost:3000 as an allowed origin on your server.

To do so, you will need to add it to the `allowedOrigins` field on your server config settings. By default, the only allowed origin is `[apiBaseUrl].com`, but you can add more in a comma-separated list. For more details, see the [Config Settings docs](/docs/self-hosting/config-settings#server-config).
