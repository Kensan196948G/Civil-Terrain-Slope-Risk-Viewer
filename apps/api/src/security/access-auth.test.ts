import { describe, expect, it } from "vitest";
import {
  createAccessJwtVerifier,
  extractBearerToken,
  type AccessJwtVerifierOptions,
} from "./access-auth.js";

const TEAM_DOMAIN = "example.cloudflareaccess.com";
const AUDIENCE = "f5aea311471ffbe2385bc00989d749bf9bb61506e6ee83497c620344abbd4cf7";

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function signJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
): Promise<string> {
  const header = { alg: "RS256", kid, typ: "JWT" };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${signingInput}.${signatureB64}`;
}

interface TestContext {
  readonly verifier: ReturnType<typeof createAccessJwtVerifier>;
  readonly privateKey: CryptoKey;
  readonly kid: string;
}

async function createVerifier(
  overrides: Partial<AccessJwtVerifierOptions> = {},
): Promise<TestContext> {
  const keyPair = await generateKeyPair();
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const kid = "test-kid-1";
  const jwks = { keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] };
  const nowSec = 1_800_000_000;

  const verifier = createAccessJwtVerifier({
    teamDomain: TEAM_DOMAIN,
    audience: AUDIENCE,
    now: () => nowSec,
    fetchImpl: async () =>
      new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ...overrides,
  });

  return { verifier, privateKey: keyPair.privateKey, kid };
}

function validPayload(nowSec = 1_800_000_000): Record<string, unknown> {
  return {
    aud: AUDIENCE,
    exp: nowSec + 300,
    iat: nowSec,
    iss: `https://${TEAM_DOMAIN}`,
    sub: "user:test",
    email: "test@example.com",
    name: "テスト利用者",
    groups: ["engineering"],
  };
}

describe("createAccessJwtVerifier", () => {
  it("accepts a valid signed token and returns claims", async () => {
    const { verifier, privateKey, kid } = await createVerifier();
    const token = await signJwt(validPayload(), privateKey, kid);

    const result = await verifier.verify(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.aud).toBe(AUDIENCE);
      expect(result.claims.email).toBe("test@example.com");
      expect(result.claims.groups).toEqual(["engineering"]);
    }
  });

  it("rejects a missing token", async () => {
    const { verifier } = await createVerifier();

    const result = await verifier.verify(null);

    expect(result).toEqual({
      ok: false,
      reason: "UNAUTHENTICATED",
      detail: expect.any(String) as string,
    });
  });

  it("rejects a malformed token", async () => {
    const { verifier } = await createVerifier();

    const result = await verifier.verify("not-a-jwt");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects an expired token", async () => {
    const { verifier, privateKey, kid } = await createVerifier();
    const payload = validPayload();
    payload["exp"] = 1_799_999_999; // now - 1s
    const token = await signJwt(payload, privateKey, kid);

    const result = await verifier.verify(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNAUTHENTICATED");
      expect(result.detail).toContain("有効期限");
    }
  });

  it("rejects a token for a different audience", async () => {
    const { verifier, privateKey, kid } = await createVerifier();
    const payload = validPayload();
    payload["aud"] = "another-app-audience";
    const token = await signJwt(payload, privateKey, kid);

    const result = await verifier.verify(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("FORBIDDEN");
    }
  });

  it("rejects a token whose signature is tampered with", async () => {
    const { verifier, privateKey, kid } = await createVerifier();
    const token = await signJwt(validPayload(), privateKey, kid);

    const result = await verifier.verify(`${token}0`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects a token signed by an unknown key id", async () => {
    const { verifier, privateKey } = await createVerifier();
    const token = await signJwt(validPayload(), privateKey, "unknown-kid");

    const result = await verifier.verify(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toContain("署名鍵");
    }
  });

  it("rejects when the certificate endpoint fails", async () => {
    const keyPair = await generateKeyPair();
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const kid = "test-kid-1";
    const verifier = createAccessJwtVerifier({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      fetchImpl: async () => new Response("boom", { status: 503 }),
    });
    const token = await signJwt(validPayload(), keyPair.privateKey, kid);
    void publicJwk;

    const result = await verifier.verify(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNAUTHENTICATED");
    }
  });

  it("caches the certificate response across verifications", async () => {
    let fetchCount = 0;
    const keyPair = await generateKeyPair();
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const kid = "cached-kid";
    const verifier = createAccessJwtVerifier({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      fetchImpl: async () => {
        fetchCount++;
        return new Response(
          JSON.stringify({ keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] }),
          { status: 200 },
        );
      },
    });
    const token = await signJwt(validPayload(), keyPair.privateKey, kid);

    await verifier.verify(token);
    await verifier.verify(token);

    expect(fetchCount).toBe(1);
  });
});

describe("extractBearerToken", () => {
  it("extracts a Bearer token from the Authorization header", () => {
    const request = new Request("https://example.com/api", {
      headers: { authorization: "Bearer abc.def.ghi" },
    });

    expect(extractBearerToken(request)).toBe("abc.def.ghi");
  });

  it("returns null when the header is absent or not Bearer", () => {
    expect(extractBearerToken(new Request("https://example.com/api"))).toBeNull();
    const basic = new Request("https://example.com/api", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(extractBearerToken(basic)).toBeNull();
  });
});
