const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
    request_id?: unknown;
  };
};

type CsrfResponse = { csrf_token: string };
type RecoveryBudget = { csrfRenewals: number; accessRefreshes: number };
type CsrfFlight = Readonly<{ epoch: number; forced: boolean; promise: Promise<string> }>;
type RefreshOutcome = Readonly<{ csrfRenewalConsumed: boolean }>;

const NETWORK_MESSAGE = "ไม่สามารถเชื่อมต่อบริการได้ กรุณาลองใหม่อีกครั้ง";
const REQUEST_MESSAGE = "คำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;
let csrfEpoch = 0;
let csrfFlight: CsrfFlight | null = null;
let refreshPromise: Promise<RefreshOutcome> | null = null;

const REFRESH_WITHOUT_CSRF = Object.freeze({ csrfRenewalConsumed: false });
const REFRESH_WITH_CSRF = Object.freeze({ csrfRenewalConsumed: true });

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | null;

  constructor(message: string, options: { status: number | null; code: string; requestId: string | null }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

function networkError(): ApiError {
  return new ApiError(NETWORK_MESSAGE, { status: null, code: "network_error", requestId: null });
}

function recoveryExhausted(): ApiError {
  return new ApiError(REQUEST_MESSAGE, {
    status: null,
    code: "recovery_exhausted",
    requestId: null
  });
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
  } catch {
    throw networkError();
  }
}

async function responseError(response: Response): Promise<ApiError> {
  let code = "request_failed";
  let message = REQUEST_MESSAGE;
  let requestId: string | null = null;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (typeof body.error?.code === "string") code = body.error.code;
    if (typeof body.error?.message === "string") message = body.error.message;
    if (typeof body.error?.request_id === "string") requestId = body.error.request_id;
  } catch {
    // Malformed error bodies are reduced to the generic safe shape.
  }
  return new ApiError(message, { status: response.status, code, requestId });
}

function requestMethod(init: RequestInit): string {
  return (init.method ?? "GET").toUpperCase();
}

function requestPath(path: string): string {
  return new URL(path, API_BASE).pathname;
}

function refreshEligible(path: string): boolean {
  const pathname = requestPath(path);
  return (
    pathname === "/api/v1/auth/me" ||
    pathname === "/api/v1/organizations" ||
    pathname.startsWith("/api/v1/organizations/") ||
    pathname === "/api/v1/farms" ||
    pathname.startsWith("/api/v1/farms/") ||
    pathname.startsWith("/api/v1/fields/")
  );
}

function startCsrfFlight(epoch: number, forced: boolean): Promise<string> {
  const request = (async () => {
    const response = await rawFetch("/api/v1/auth/csrf", { method: "GET" });
    if (!response.ok) throw await responseError(response);
    let body: CsrfResponse;
    try {
      body = (await response.json()) as CsrfResponse;
    } catch {
      throw new ApiError(REQUEST_MESSAGE, {
        status: response.status,
        code: "invalid_response",
        requestId: null
      });
    }
    if (typeof body.csrf_token !== "string" || body.csrf_token.length === 0) {
      throw new ApiError(REQUEST_MESSAGE, {
        status: response.status,
        code: "invalid_response",
        requestId: null
      });
    }
    if (epoch === csrfEpoch) csrfToken = body.csrf_token;
    return body.csrf_token;
  })();
  const promise = request.finally(() => {
    if (csrfFlight?.epoch === epoch) csrfFlight = null;
  });
  csrfFlight = Object.freeze({ epoch, forced, promise });
  return promise;
}

async function bootstrapCsrf(force: boolean): Promise<string> {
  if (force) {
    if (csrfFlight?.epoch === csrfEpoch && csrfFlight.forced) {
      return csrfFlight.promise;
    }
    csrfEpoch += 1;
    csrfToken = null;
    return startCsrfFlight(csrfEpoch, true);
  }
  if (csrfToken !== null) return csrfToken;
  if (csrfFlight?.epoch === csrfEpoch) return csrfFlight.promise;
  return startCsrfFlight(csrfEpoch, false);
}

function requestHeaders(init: RequestInit, token: string | null): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (token !== null) headers.set("X-CSRF-Token", token);
  return headers;
}

async function internalRefresh(allowCsrfRenewal: boolean): Promise<RefreshOutcome> {
  const attempt = async (): Promise<Response> => {
    const token = await bootstrapCsrf(false);
    return rawFetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: requestHeaders({}, token)
    });
  };

  let response = await attempt();
  if (response.ok) return REFRESH_WITHOUT_CSRF;

  let error = await responseError(response);
  if (error.status === 403 && error.code === "csrf_failed" && allowCsrfRenewal) {
    await bootstrapCsrf(true);
    response = await attempt();
    if (response.ok) return REFRESH_WITH_CSRF;
    error = await responseError(response);
  }
  throw error;
}

async function refreshAccess(allowCsrfRenewal: boolean): Promise<RefreshOutcome> {
  if (refreshPromise === null) {
    const request = internalRefresh(allowCsrfRenewal);
    const promise = request.finally(() => {
      if (refreshPromise === promise) refreshPromise = null;
    });
    refreshPromise = promise;
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = requestMethod(init);
  const unsafe = UNSAFE_METHODS.has(method);
  const budget: RecoveryBudget = { csrfRenewals: 0, accessRefreshes: 0 };

  let attempts = 0;
  while (attempts < 3) {
    if (unsafe && csrfToken === null) await bootstrapCsrf(false);
    attempts += 1;
    const response = await rawFetch(path, {
      ...init,
      method,
      headers: requestHeaders(init, unsafe ? csrfToken : null)
    });
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    const error = await responseError(response);
    if (
      unsafe &&
      error.status === 403 &&
      error.code === "csrf_failed" &&
      budget.csrfRenewals < 1 &&
      attempts < 3
    ) {
      budget.csrfRenewals += 1;
      await bootstrapCsrf(true);
      continue;
    }
    if (
      error.status === 401 &&
      error.code === "authentication_required" &&
      refreshEligible(path) &&
      budget.accessRefreshes < 1 &&
      attempts < 3
    ) {
      budget.accessRefreshes += 1;
      const refresh = await refreshAccess(budget.csrfRenewals < 1);
      if (refresh.csrfRenewalConsumed) {
        if (budget.csrfRenewals >= 1) throw recoveryExhausted();
        budget.csrfRenewals += 1;
      }
      continue;
    }
    throw error;
  }

  throw recoveryExhausted();
}

export function resetApiClientStateForTests(): void {
  csrfToken = null;
  csrfEpoch += 1;
  csrfFlight = null;
  refreshPromise = null;
}
