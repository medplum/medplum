import { BotEvent, MedplumClient } from "@medplum/core";
import { DiagnosticReport } from "@medplum/fhirtypes";

type OrderEvent = {
  id: string;
};

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Check if event.input is of type Resource
  if (typeof event.input !== "object" || !("id" in event.input)) {
    return false;
  }

  const orderID = (event.input as OrderEvent).id;
  return saveResults(medplum, event, orderID);
}

async function saveResults(medplum: MedplumClient, event: BotEvent, orderID: string): Promise<any> {
  const VITAL_API_KEY = event.secrets["VITAL_API_KEY"].valueString;
  const VITAL_BASE_URL = event.secrets["VITAL_BASE_URL"].valueString || "https://api.dev.tryvital.io";

  if (!VITAL_API_KEY || !VITAL_BASE_URL) {
    throw new Error("VITAL_API_KEY and VITAL_BASE_URL are required");
  }

  const FETCH_RESULT_URL = VITAL_BASE_URL + `/v3/order/${orderID}/result/fhir`;

  const resp = await fetch(FETCH_RESULT_URL, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-vital-api-key": VITAL_API_KEY,
    },
  });

  // Not a 2xx response
  if (resp.status - 200 >= 100) {
    throw new Error("Vital API error: " + (await resp.text()));
  }

  const bundle = (await resp.json()) as DiagnosticReport;
  const result = await medplum.createResource(bundle);

  return result.id;
}
