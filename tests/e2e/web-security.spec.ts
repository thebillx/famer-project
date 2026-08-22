import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { ApiError, apiFetch, resetApiClientStateForTests } from "../../apps/web/lib/api";


type FetchHandler = (path: string, init: RequestInit) => Promise<Response> | Response;
const originalFetch = globalThis.fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function error(status: number, code: string, requestId = `request-${status}`): Response {
  return json(
    {
      error: {
        code,
        message: `public ${code}`,
        request_id: requestId,
        details: {}
      }
    },
    status
  );
}

function installFetch(handler: FetchHandler): void {
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return handler(url.pathname, init ?? {});
  };
}

test.beforeEach(() => {
  expect(globalThis.fetch).toBe(originalFetch);
  resetApiClientStateForTests();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetApiClientStateForTests();
});

test("concurrent unsafe callers single-flight the CSRF bootstrap", async () => {
  let csrfCalls = 0;
  let mutationCalls = 0;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  installFetch(async (path, init) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      await blocked;
      return json({ csrf_token: "shared-token" });
    }
    mutationCalls += 1;
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("shared-token");
    return json({ ok: true });
  });

  const requests = [
    apiFetch<{ ok: boolean }>("/api/v1/farms", { method: "POST" }),
    apiFetch<{ ok: boolean }>("/api/v1/farms", { method: "POST" })
  ];
  await expect.poll(() => csrfCalls).toBe(1);
  release?.();
  await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }]);
  expect(csrfCalls).toBe(1);
  expect(mutationCalls).toBe(2);
});

test("one csrf_failed renews once and replays the original once", async () => {
  let csrfCalls = 0;
  let originalCalls = 0;
  installFetch((path, init) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      return json({ csrf_token: `token-${csrfCalls}` });
    }
    originalCalls += 1;
    const token = new Headers(init.headers).get("x-csrf-token");
    if (originalCalls === 1) {
      expect(token).toBe("token-1");
      return error(403, "csrf_failed");
    }
    expect(token).toBe("token-2");
    return json({ ok: true });
  });

  await expect(apiFetch("/api/v1/farms", { method: "POST" })).resolves.toEqual({ ok: true });
  expect({ csrfCalls, originalCalls }).toEqual({ csrfCalls: 2, originalCalls: 2 });
});

test("concurrent csrf_failed callers share one forced renewal without a stale null cache", async () => {
  let csrfCalls = 0;
  let originalCalls = 0;
  let releaseRenewal: (() => void) | undefined;
  const renewalBlocked = new Promise<void>((resolve) => {
    releaseRenewal = resolve;
  });
  installFetch(async (path, init) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      if (csrfCalls === 2) await renewalBlocked;
      return json({ csrf_token: `token-${csrfCalls}` });
    }
    originalCalls += 1;
    if (originalCalls <= 2) return error(403, "csrf_failed");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("token-2");
    return json({ ok: true });
  });

  const callers = [
    apiFetch("/api/v1/farms", { method: "POST" }),
    apiFetch("/api/v1/farms", { method: "POST" })
  ];
  await expect.poll(() => csrfCalls).toBe(2);
  releaseRenewal?.();
  await expect(Promise.all(callers)).resolves.toEqual([{ ok: true }, { ok: true }]);
  expect({ csrfCalls, originalCalls }).toEqual({ csrfCalls: 2, originalCalls: 4 });

  await expect(apiFetch("/api/v1/farms", { method: "POST" })).resolves.toEqual({ ok: true });
  expect(csrfCalls).toBe(2);
});

test("concurrent eligible 401 callers share one access refresh and replay independently", async () => {
  let csrfCalls = 0;
  let refreshCalls = 0;
  let originalCalls = 0;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  installFetch(async (path) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      return json({ csrf_token: "refresh-csrf" });
    }
    if (path === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      await blocked;
      return new Response(null, { status: 204 });
    }
    originalCalls += 1;
    return originalCalls <= 2 ? error(401, "authentication_required") : json({ id: originalCalls });
  });

  const callers = [apiFetch("/api/v1/auth/me"), apiFetch("/api/v1/auth/me")];
  await expect.poll(() => refreshCalls).toBe(1);
  release?.();
  await expect(Promise.all(callers)).resolves.toHaveLength(2);
  expect({ csrfCalls, refreshCalls, originalCalls }).toEqual({ csrfCalls: 1, refreshCalls: 1, originalCalls: 4 });
});

test("shared refresh merges csrf consumption into every waiter and blocks an exhausted caller", async () => {
  const mixedPath = "/api/v1/fields/field-id/satellite/search-latest";
  let csrfCalls = 0;
  let refreshCalls = 0;
  let mixedCalls = 0;
  let meCalls = 0;
  let markMixedSecond: (() => void) | undefined;
  let releaseMixedSecond: (() => void) | undefined;
  let markThirdCsrf: (() => void) | undefined;
  let releaseThirdCsrf: (() => void) | undefined;
  const mixedSecondSeen = new Promise<void>((resolve) => {
    markMixedSecond = resolve;
  });
  const mixedSecondBlocked = new Promise<void>((resolve) => {
    releaseMixedSecond = resolve;
  });
  const thirdCsrfSeen = new Promise<void>((resolve) => {
    markThirdCsrf = resolve;
  });
  const thirdCsrfBlocked = new Promise<void>((resolve) => {
    releaseThirdCsrf = resolve;
  });

  installFetch(async (path) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      const currentCall = csrfCalls;
      if (currentCall === 3) {
        markThirdCsrf?.();
        await thirdCsrfBlocked;
      }
      return json({ csrf_token: `csrf-${currentCall}` });
    }
    if (path === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      return refreshCalls === 1
        ? error(403, "csrf_failed", "refresh-csrf")
        : new Response(null, { status: 204 });
    }
    if (path === mixedPath) {
      mixedCalls += 1;
      if (mixedCalls === 1) return error(403, "csrf_failed");
      markMixedSecond?.();
      await mixedSecondBlocked;
      return error(401, "authentication_required");
    }
    if (path === "/api/v1/auth/me") {
      meCalls += 1;
      return meCalls === 1 ? error(401, "authentication_required") : json({ id: "viewer" });
    }
    throw new Error(`unexpected path ${path}`);
  });

  const exhaustedCaller = apiFetch(mixedPath, { method: "POST" });
  await mixedSecondSeen;
  const freshCaller = apiFetch<{ id: string }>("/api/v1/auth/me");
  await thirdCsrfSeen;
  releaseMixedSecond?.();
  releaseThirdCsrf?.();

  const [exhausted, fresh] = await Promise.allSettled([exhaustedCaller, freshCaller]);
  expect(exhausted.status).toBe("rejected");
  if (exhausted.status === "rejected") {
    expect(exhausted.reason).toMatchObject({
      status: null,
      code: "recovery_exhausted",
      requestId: null
    });
  }
  expect(fresh).toEqual({ status: "fulfilled", value: { id: "viewer" } });
  expect({ csrfCalls, refreshCalls, mixedCalls, meCalls }).toEqual({
    csrfCalls: 3,
    refreshCalls: 2,
    mixedCalls: 2,
    meCalls: 2
  });
});

test("invalid refresh terminates every waiter with the same typed 401 and no recursion", async () => {
  let refreshCalls = 0;
  let originalCalls = 0;
  installFetch((path) => {
    if (path === "/api/v1/auth/csrf") return json({ csrf_token: "csrf" });
    if (path === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      return error(401, "invalid_refresh_token", "refresh-request");
    }
    originalCalls += 1;
    return error(401, "authentication_required");
  });

  const results = await Promise.allSettled([apiFetch("/api/v1/farms"), apiFetch("/api/v1/farms")]);
  expect(refreshCalls).toBe(1);
  expect(originalCalls).toBe(2);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBeInstanceOf(ApiError);
      expect(result.reason).toMatchObject({ status: 401, code: "invalid_refresh_token", requestId: "refresh-request" });
    }
  }
});

test("refresh csrf exhaustion retains the typed 403", async () => {
  let csrfCalls = 0;
  let refreshCalls = 0;
  installFetch((path) => {
    if (path === "/api/v1/auth/csrf") {
      csrfCalls += 1;
      return json({ csrf_token: `csrf-${csrfCalls}` });
    }
    if (path === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      return error(403, "csrf_failed", `csrf-${refreshCalls}`);
    }
    return error(401, "authentication_required");
  });

  await expect(apiFetch("/api/v1/auth/me")).rejects.toMatchObject({
    status: 403,
    code: "csrf_failed",
    requestId: "csrf-2"
  });
  expect({ csrfCalls, refreshCalls }).toEqual({ csrfCalls: 2, refreshCalls: 2 });
});

for (const [status, code] of [[429, "rate_limited"], [503, "temporarily_unavailable"]] as const) {
  test(`refresh ${status} retains its typed failure`, async () => {
    installFetch((path) => {
      if (path === "/api/v1/auth/csrf") return json({ csrf_token: "csrf" });
      if (path === "/api/v1/auth/refresh") return error(status, code, `refresh-${status}`);
      return error(401, "authentication_required");
    });
    await expect(apiFetch("/api/v1/auth/me")).rejects.toMatchObject({
      status,
      code,
      requestId: `refresh-${status}`
    });
  });
}

test("refresh network failure becomes the typed safe network_error", async () => {
  installFetch((path) => {
    if (path === "/api/v1/auth/csrf") return json({ csrf_token: "csrf" });
    if (path === "/api/v1/auth/refresh") throw new Error("raw private network detail");
    return error(401, "authentication_required");
  });
  const result = await apiFetch("/api/v1/auth/me").catch((caught) => caught);
  expect(result).toBeInstanceOf(ApiError);
  expect(result).toMatchObject({ status: null, code: "network_error", requestId: null });
  expect((result as ApiError).message).not.toContain("raw private network detail");
});

for (const sequence of ["csrf-then-auth", "auth-then-csrf"] as const) {
  test(`mixed ${sequence} consumes each budget once and caps original attempts at three`, async () => {
    let csrfCalls = 0;
    let refreshCalls = 0;
    let originalCalls = 0;
    installFetch((path) => {
      if (path === "/api/v1/auth/csrf") {
        csrfCalls += 1;
        return json({ csrf_token: `csrf-${csrfCalls}` });
      }
      if (path === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        return new Response(null, { status: 204 });
      }
      originalCalls += 1;
      const codes = sequence === "csrf-then-auth"
        ? [[403, "csrf_failed"], [401, "authentication_required"]]
        : [[401, "authentication_required"], [403, "csrf_failed"]];
      const next = codes[originalCalls - 1];
      return next ? error(next[0] as number, next[1] as string) : json({ ok: true });
    });

    await expect(apiFetch("/api/v1/fields/field-id/satellite/search-latest", { method: "POST" })).resolves.toEqual({ ok: true });
    expect(originalCalls).toBe(3);
    expect(refreshCalls).toBe(1);
    expect(csrfCalls).toBe(2);
  });
}

test("ineligible status, code, and auth endpoints never refresh or replay", async () => {
  const cases = [
    ["/api/v1/auth/login", "POST", 401, "invalid_credentials"],
    ["/api/v1/auth/logout", "POST", 401, "authentication_required"],
    ["/api/v1/farms", "GET", 401, "invalid_credentials"],
    ["/api/v1/farms", "GET", 403, "forbidden"],
    ["/api/v1/farms", "GET", 404, "not_found"],
    ["/api/v1/farms", "GET", 422, "validation_error"],
    ["/api/v1/farms", "GET", 429, "rate_limited"],
    ["/api/v1/farms", "GET", 500, "internal_error"]
  ] as const;

  for (const [path, method, status, code] of cases) {
    resetApiClientStateForTests();
    let originalCalls = 0;
    let refreshCalls = 0;
    installFetch((requestPath) => {
      if (requestPath === "/api/v1/auth/csrf") return json({ csrf_token: "csrf" });
      if (requestPath === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        return new Response(null, { status: 204 });
      }
      originalCalls += 1;
      return error(status, code);
    });
    await expect(apiFetch(path, { method })).rejects.toMatchObject({ status, code });
    expect({ originalCalls, refreshCalls }).toEqual({ originalCalls: 1, refreshCalls: 0 });
  }
});

test("browser source exposes no token storage and satellite types/card keep a visible neutral initial state", async () => {
  const [apiSource, typeSource, cardSource] = await Promise.all([
    readFile("apps/web/lib/api.ts", "utf8"),
    readFile("apps/web/lib/types.ts", "utf8"),
    readFile("apps/web/components/SatelliteStatusCard.tsx", "utf8")
  ]);
  expect(apiSource).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  expect(apiSource).not.toMatch(/access_token|refresh_token/i);
  expect(typeSource).toContain('status: "not_searched"');
  expect(typeSource).toContain("acquisition: null");
  expect(typeSource).toContain("searched_at: null");
  expect(cardSource).toContain('result?.status === "not_searched"');
  expect(cardSource).toContain("ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้");
  expect(cardSource).not.toMatch(/วินิจฉัย|ความเสี่ยง|แจ้งเตือน|คำแนะนำ|ปลอดภัย|ปกติดี/);
});

test("satellite card visibly renders the neutral not_searched state atomically", async ({ page }) => {
  const userId = "00000000-0000-0000-0000-000000000001";
  const organizationId = "00000000-0000-0000-0000-000000000010";
  const farmId = "00000000-0000-0000-0000-000000000020";
  const fieldId = "00000000-0000-0000-0000-000000000030";
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
      "/api/v1/auth/me": { id: userId, email: "viewer@example.com", display_name: "Viewer" },
      "/api/v1/organizations": [{ id: organizationId, name: "Review Org", slug: "review-org", status: "active" }],
      [`/api/v1/organizations/${organizationId}/members`]: [
        { id: "membership-1", user_id: userId, role: "viewer", status: "active" }
      ],
      [`/api/v1/farms/${farmId}`]: {
        id: farmId,
        organization_id: organizationId,
        name: "Review Farm",
        province: "Chiang Mai",
        status: "active",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z"
      },
      [`/api/v1/farms/${farmId}/fields`]: [
        {
          id: fieldId,
          farm_id: farmId,
          organization_id: organizationId,
          name: "Review Field",
          geometry: {
            type: "Polygon",
            coordinates: [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.79]]]
          },
          area_sqm: "1200",
          area_rai: "0.75",
          status: "active",
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z"
        }
      ],
      [`/api/v1/fields/${fieldId}/satellite/latest`]: {
        field_id: fieldId,
        status: "not_searched",
        acquisition: null,
        searched_at: null,
        message_th: "ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้"
      }
    };
    const body = bodies[path];
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: "application/json",
      body: JSON.stringify(body ?? { error: { code: "not_found", message: "Not found" } })
    });
  });

  await page.goto(`/farms/${farmId}`);
  await expect(page.getByText("ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้", { exact: true })).toBeVisible();
  await expect(page.getByText("เริ่มตรวจสอบเมื่อพร้อม ระบบจะแสดงเฉพาะข้อมูลประกอบภาพที่ค้นพบ", { exact: true })).toBeVisible();
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/วินิจฉัย|ความเสี่ยง|แจ้งเตือน|คำแนะนำ|ปลอดภัย|ปกติดี/);
});
