/**
 * 構造化ログ・監査イベント (監視・障害対応の基盤)。
 *
 * Cloudflare Workers の console 出力は Observability (Workers Logs) へ流れるため、
 * JSON 1行形式で発行し、ダッシュボード・ログ検索で機械的に扱えるようにする。
 *
 * プライバシー原則 (docs/ガバナンスとプライバシー.md): 精密座標・認証トークン・
 * メールアドレス・接続文字列はログに含めない。利用者識別は Access JWT の `sub`
 * (不透明ID) のみを使う。
 */

export interface AuditEvent {
  readonly event: "access" | "error";
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly outcome: "allowed" | "denied-auth" | "denied-role" | "rate-limited" | "error";
  readonly status?: number;
  /** Access JWT の sub (不透明ID)。メールアドレスは含めない。 */
  readonly user?: string;
  readonly role?: string;
  /** error イベントのみ。内部詳細は含めずエラー種別のみ。 */
  readonly errorKind?: string;
}

export type LogSink = (line: string) => void;

/** JSON 1行の監査イベントを発行する。テストでは LogSink を差し替える。 */
export function emitAudit(sink: LogSink, event: AuditEvent): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

/** 未捕捉エラー用の構造化ログ (internal error の分類のみ)。 */
export function emitError(sink: LogSink, event: AuditEvent): void {
  emitAudit(sink, event);
}
