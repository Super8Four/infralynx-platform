export class ApiClientError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number | null, retryable: boolean) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiClientError("Unable to reach the InfraLynx API.", null, true);
  }

  if (!response.ok) {
    throw new ApiClientError(
      `InfraLynx API request failed with status ${response.status}.`,
      response.status,
      response.status >= 500
    );
  }

  return response.json() as Promise<T>;
}
