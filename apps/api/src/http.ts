import { createProblemDetails } from "@civil-terrain/domain";
import type { ErrorCode } from "@civil-terrain/domain";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
// RFC 9457 designates this media type for Problem Details responses.
const PROBLEM_CONTENT_TYPE = "application/problem+json; charset=utf-8";

export const REQUEST_ID_HEADER = "x-request-id";

// Security headers applied to every response.
// References: 詳細設計仕様書 12.1, OWASP Secure Headers Project.
// CSP needs adjustment when external resources (fonts, tile servers) are used.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  // SPA inline styles from Vite/Maplibre; MapLibre uses inline style for canvas
  // Google Fonts stylesheet (IBM Plex Sans JP / Mono) も許可する
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // MapLibre worker blob, GSI tiles, fonts
  "img-src 'self' data: blob: https://cyberjapandata2.gsi.go.jp https://maps.gsi.go.jp",
  "connect-src 'self' https://cyberjapandata2.gsi.go.jp",
  "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP_DIRECTIVES,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(self), microphone=(), usb=()",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

/**
 * Injects standard security headers into a Response.
 * Used to wrap every response (API + static assets) from the fetch handler.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Prevent overwriting headers already set by the route handler
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Builds a JSON success response with the shared header conventions. */
export function jsonResponse(body: unknown, status: number, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildHeaders(JSON_CONTENT_TYPE, requestId),
  });
}

interface ProblemOptions {
  readonly detail?: string;
  readonly instance?: string;
  // Required: the openapi contract promises requestId on every error response.
  readonly requestId: string;
}

/**
 * Builds an RFC 9457 Problem Details response. The HTTP status is derived from
 * the error code via the domain's ERROR_STATUS_MAP, keeping status and code in
 * lockstep.
 */
export function problemResponse(code: ErrorCode, title: string, options: ProblemOptions): Response {
  const problem = createProblemDetails(code, title, options);
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: buildHeaders(PROBLEM_CONTENT_TYPE, options.requestId),
  });
}

function buildHeaders(contentType: string, requestId?: string): Headers {
  const headers = new Headers({ "content-type": contentType });
  if (requestId !== undefined) {
    headers.set(REQUEST_ID_HEADER, requestId);
  }
  return headers;
}
