/* API client — thin fetch wrapper that returns the parsed envelope.
 *
 * Honours the contract documented in docs/api.md:
 *   - Every successful response is { data, meta }
 *   - Errors are { error: { code, message } }
 *   - ETags are deterministic; the browser HTTP cache will replay 304s
 *     transparently when the same URL is requested within Cache-Control max-age.
 */

export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async get(path, params) {
    const url = new URL(this.baseUrl + path, window.location.origin);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit", // never send cookies — no PII surface
      // Force revalidation against the server so polling sees fresh phase
      // and live data. The server's ETag still skips transfer for unchanged
      // payloads (304), so the cache-friendliness story is preserved upstream.
      cache: "no-cache",
    });
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch { body = null; }
      const message = body?.error?.message || `HTTP ${response.status}`;
      const code = body?.error?.code || "http_error";
      throw new ApiError(code, message, response.status);
    }
    return response.json();
  }

  // Dev-only — flips a match's phase. Used by the example page demo button.
  async setPhase(matchId, phase) {
    const response = await fetch(`${this.baseUrl}/_dev/phase/${encodeURIComponent(matchId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    if (!response.ok) throw new ApiError("phase_toggle_failed", `HTTP ${response.status}`, response.status);
  }
}

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
