export interface MessageResult {
  key: { id: string };
  status: string;
}

export interface WhatsAppProvider {
  sendText(to: string, text: string): Promise<MessageResult>;
}

export class EvolutionProvider implements WhatsAppProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private instanceName: string
  ) {}

  async sendText(to: string, text: string): Promise<MessageResult> {
    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instanceName}`, {
      method: 'POST',
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: to, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Evolution API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<MessageResult>;
  }
}

export function createEvolutionProvider(): EvolutionProvider {
  return new EvolutionProvider(
    process.env.EVOLUTION_API_URL!,
    process.env.EVOLUTION_API_KEY!,
    process.env.EVOLUTION_INSTANCE!
  );
}
