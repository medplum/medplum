const BASE_URL = () =>
  process.env.ASAAS_SANDBOX === 'true'
    ? 'https://api-sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/api/v3';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL()}${path}`, {
    ...init,
    headers: {
      'access_token': process.env.ASAAS_API_KEY!,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asaas API error ${res.status}: ${text}`);
  }

  return res.json() as T;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  status: string;
  nextDueDate: string;
  value: number;
}

export const asaas = {
  createCustomer(data: { name: string; cpfCnpj: string; email: string }) {
    return request<AsaasCustomer>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createSubscription(data: {
    customer: string;
    value: number;
    nextDueDate: string;
    description: string;
  }) {
    return request<AsaasSubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        billingType: 'PIX',
        cycle: 'MONTHLY',
      }),
    });
  },

  cancelSubscription(id: string) {
    return request<void>(`/subscriptions/${id}`, { method: 'DELETE' });
  },

  getSubscription(id: string) {
    return request<AsaasSubscription>(`/subscriptions/${id}`);
  },
};
