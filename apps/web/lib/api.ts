import type { ApiErrorBody } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // The status text is the safest fallback when the server returned no JSON.
  }
  const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
  throw new ApiError(
    message ?? response.statusText ?? 'The request failed.',
    response.status,
    body.code,
  );
}
