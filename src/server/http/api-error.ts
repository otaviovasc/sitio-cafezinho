export type ApiStatus = 400 | 401 | 404 | 409 | 413 | 429 | 500 | 503;

export class ApiError extends Error {
  constructor(message: string, readonly status: ApiStatus = 400, readonly code = 'INVALID_REQUEST') {
    super(message);
  }
}

export function fail(message: string, status?: ApiStatus, code?: string): never {
  throw new ApiError(message, status, code);
}
