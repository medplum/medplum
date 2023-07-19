import { MantineProvider } from "@mantine/core";
import { MedplumClient } from "@medplum/core";
import { MedplumProvider } from "@medplum/react";
import { AppProps } from "next/app";
import Head from "next/head";

const medplum = new MedplumClient({
  // Uncomment this to run against the server on your localhost
  // baseUrl: 'http://localhost:8103/',

  // Handle unauthenticated requests
  onUnauthenticated: () => (window.location.href = "/"),

  // Use Next.js fetch
  fetch: (url: string, options?: any) => fetch(url, options),
});

export default function App(props: AppProps) {
  const { Component, pageProps } = props;

  return (
    <>
      <Head>
        <title>Page title</title>
        <link rel="shortcut icon" href="/favicon.svg" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
      </Head>

      <MantineProvider withGlobalStyles withNormalizeCSS>
        <MedplumProvider medplum={medplum}>
          <Component {...pageProps} />
        </MedplumProvider>
      </MantineProvider>
    </>
  );
}
