import { env } from './env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params?: Params;
  body?: unknown;
  headers?: Record<string, string>;
}

const queryString = (params?: Params) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
};

/** Turns the API's validation details into a readable sentence. */
function describeDetails(details: unknown): string {
  if (!Array.isArray(details)) return '';
  return details
    .map((d: { path?: string; message?: string }) => (d?.path ? `${d.path}: ${d.message}` : d?.message))
    .filter(Boolean)
    .join('; ');
}

function createClient(baseUrl: string) {
  async function request<T>(path: string, { method = 'GET', params, body, headers }: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}${queryString(params)}`, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the server at ${baseUrl}. Is it running?`);
    }

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const err = json?.error;
      const detail = describeDetails(err?.details);
      throw new ApiError(
        response.status,
        err?.code ?? 'HTTP_ERROR',
        err?.message ? (detail ? `${err.message} (${detail})` : err.message) : `Request failed (${response.status})`,
        err?.details,
      );
    }
    return json as T;
  }

  return {
    get: <T>(path: string, params?: Params) => request<T>(path, { params }),
    post: <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', body, headers }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

export const catalogHttp = createClient(env.catalogUrl);
export const insightsHttp = createClient(env.insightsUrl);

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong');
