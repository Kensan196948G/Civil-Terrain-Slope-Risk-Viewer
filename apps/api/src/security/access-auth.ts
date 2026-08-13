/**
 * Cloudflare Access JWT の Worker 側検証 (限定検証。詳細設計仕様書 12章・
 * openapi cloudflareAccessJwt スキーム)。
 *
 * エッジの Cloudflare Access が全リソースを保護する構成が本番の一次防御だが、
 * UI 表示に依存せず Worker 自体でも JWT を検証する (defense in depth)。
 * env に CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD が設定されている場合のみ有効化
 * され、未設定時は従来どおり全ルートが通過する (設定は人間が wrangler secret で
 * 登録する前提)。
 *
 * 検証手順:
 * 1. Cf-Access-Jwt-Assertion (Cloudflare標準) または
 *    Authorization: Bearer <JWT> からトークンを取り出す
 * 2. https://<teamDomain>/cdn-cgi/access/certs から kid 対応の公開鍵を取得
 *    (TTL キャッシュ付き)
 * 3. 署名を RS256 で検証し、exp / aud を検査する
 */

export type AccessAuthFailureReason = "UNAUTHENTICATED" | "FORBIDDEN";

export type AccessAuthResult =
  | { readonly ok: true; readonly claims: AccessClaims }
  | { readonly ok: false; readonly reason: AccessAuthFailureReason; readonly detail: string };

/** Cloudflare Access JWT のクレームのうち検証・監査に使う部分。 */
export interface AccessClaims {
  readonly sub: string | undefined;
  readonly email: string | undefined;
  readonly name: string | undefined;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number | undefined;
  readonly iss: string | undefined;
  /** Access ポリシーの Group ID 等。未設定でも JWT は有効。 */
  readonly groups: readonly string[] | undefined;
}

interface JwtHeader {
  readonly alg?: string;
  readonly kid?: string;
}

interface JwkKey {
  readonly kid?: string;
  readonly kty?: string;
  readonly alg?: string;
  readonly use?: string;
  readonly n?: string;
  readonly e?: string;
}

interface AccessCertsResponse {
  readonly keys?: readonly JwkKey[];
}

export interface AccessJwtVerifierOptions {
  readonly teamDomain: string;
  readonly audience: string;
  /** テスト用のフェッチ実装。既定はグローバル fetch。 */
  readonly fetchImpl?: typeof fetch;
  /** テスト用の現在時刻 (Unix 秒)。 */
  readonly now?: () => number;
  /** 公開鍵キャッシュの TTL (ミリ秒)。既定 10 分。 */
  readonly cacheTtlMs?: number;
}

export interface AccessJwtVerifier {
  verify(token: string | null): Promise<AccessAuthResult>;
}

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** Base64URL (padding なし) → Uint8Array。入力が不正なら null。 */
function base64UrlToBytes(value: string) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonPart<T>(part: string): T | null {
  const bytes = base64UrlToBytes(part);
  if (bytes === null) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function tokenFromRequest(request: Request): string | null {
  const accessHeader = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (accessHeader !== undefined && accessHeader !== "") {
    return accessHeader;
  }

  const header = request.headers.get("authorization");
  if (header === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Access JWT 検証器を組み立てる。secret や証明書の値をログに出さない。
 * 失敗理由はクライアントへ詳細を過剰に開示しない (トークン形式の構造だけ返す)。
 */
export function createAccessJwtVerifier(options: AccessJwtVerifierOptions): AccessJwtVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? ((): number => Math.floor(Date.now() / 1000));
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const certsUrl = `https://${options.teamDomain}/cdn-cgi/access/certs`;

  let cachedKeys: readonly JwkKey[] | null = null;
  let cacheExpiresAt = 0;

  const loadKeys = async (): Promise<readonly JwkKey[] | null> => {
    const nowMs = Date.now();
    if (cachedKeys !== null && nowMs < cacheExpiresAt) {
      return cachedKeys;
    }
    try {
      const response = await fetchImpl(certsUrl);
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as AccessCertsResponse;
      if (!Array.isArray(body.keys) || body.keys.length === 0) {
        return null;
      }
      cachedKeys = body.keys;
      cacheExpiresAt = nowMs + cacheTtlMs;
      return cachedKeys;
    } catch {
      return null;
    }
  };

  const verifyToken = async (token: string | null): Promise<AccessAuthResult> => {
    if (token === null || token === "") {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "認証情報がありません。" };
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "トークンの形式が不正です。" };
    }

    const [headPart, claimsPart, signaturePart] = parts;
    if (headPart === undefined || claimsPart === undefined || signaturePart === undefined) {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "トークンの形式が不正です。" };
    }
    const header = decodeJsonPart<JwtHeader>(headPart);
    const claims = decodeJsonPart<Record<string, unknown>>(claimsPart);
    const signature = base64UrlToBytes(signaturePart);
    if (
      header === null ||
      claims === null ||
      signature === null ||
      header.alg !== "RS256" ||
      header.kid === undefined
    ) {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "トークンの形式が不正です。" };
    }

    if (typeof claims.exp !== "number" || claims.exp <= now()) {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "トークンの有効期限が切れています。" };
    }
    if (typeof claims.aud !== "string" || claims.aud !== options.audience) {
      return {
        ok: false,
        reason: "FORBIDDEN",
        detail: "このアプリケーションのトークンではありません。",
      };
    }

    const keys = await loadKeys();
    const key = keys?.find((candidate) => candidate.kid === header.kid);
    if (key === undefined || key.kty !== "RSA" || key.n === undefined || key.e === undefined) {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "署名鍵を取得できませんでした。" };
    }

    try {
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: key.n, e: key.e, alg: "RS256" },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const valid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        publicKey,
        signature,
        data,
      );
      if (!valid) {
        return { ok: false, reason: "UNAUTHENTICATED", detail: "署名の検証に失敗しました。" };
      }
    } catch {
      return { ok: false, reason: "UNAUTHENTICATED", detail: "署名の検証に失敗しました。" };
    }

    return {
      ok: true,
      claims: {
        sub: typeof claims.sub === "string" ? claims.sub : undefined,
        email: typeof claims.email === "string" ? claims.email : undefined,
        name: typeof claims.name === "string" ? claims.name : undefined,
        aud: claims.aud,
        exp: claims.exp,
        iat: typeof claims.iat === "number" ? claims.iat : undefined,
        iss: typeof claims.iss === "string" ? claims.iss : undefined,
        groups: Array.isArray(claims.groups)
          ? claims.groups.filter((g) => typeof g === "string")
          : undefined,
      },
    };
  };

  return { verify: verifyToken };
}

/** Cloudflare Access JWT をリクエストヘッダーから取り出す (ルーター側で使用)。 */
export function extractAccessToken(request: Request): string | null {
  return tokenFromRequest(request);
}
