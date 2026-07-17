import { createProblemDetails } from "@civil-terrain/domain";
import type { ErrorCode } from "@civil-terrain/domain";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
// RFC 9457 designates this media type for Problem Details responses.
const PROBLEM_CONTENT_TYPE = "application/problem+json; charset=utf-8";

export const REQUEST_ID_HEADER = "x-request-id";

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
