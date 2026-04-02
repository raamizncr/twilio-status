export function basicAuthHeader(accountSid: string, authToken: string): string {
  const b = Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64");
  return `Basic ${b}`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** Returns null on 404; throws on other errors */
export async function fetchJsonOptional<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  return JSON.parse(text) as T;
}
