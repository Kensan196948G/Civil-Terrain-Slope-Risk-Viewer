/**
 * ロールベースアクセス制御 (docs/セキュリティ.md 認可マトリクスの最小実装)。
 *
 * ロールは Cloudflare Access JWT の `groups` クレームと、env で指定する
 * Group ID の対応で決定する。未設定時は認証済みユーザー全員を Viewer とする
 * (安全側の既定: 権限を与えすぎない)。
 *
 * 階層: viewer < analyst < data-admin < system-admin (上位は下位の権限を含む)。
 */

export type Role = "viewer" | "analyst" | "data-admin" | "system-admin";

export interface RbacConfig {
  /** Analyst 以上に与える Access Group ID。 */
  readonly analystGroups: readonly string[];
  /** DataAdmin 以上に与える Access Group ID。 */
  readonly dataAdminGroups: readonly string[];
  /** SystemAdmin に与える Access Group ID。 */
  readonly adminGroups: readonly string[];
}

const ROLE_ORDER: readonly Role[] = ["viewer", "analyst", "data-admin", "system-admin"];

/** カンマ区切りの env 値を Group ID 配列へ解釈する。空・不正は空配列。 */
export function parseGroupList(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/** JWT の groups クレームからロールを決定する。 */
export function roleFromGroups(groups: readonly string[] | undefined, config: RbacConfig): Role {
  const userGroups = new Set(groups ?? []);
  if (config.adminGroups.some((group) => userGroups.has(group))) {
    return "system-admin";
  }
  if (config.dataAdminGroups.some((group) => userGroups.has(group))) {
    return "data-admin";
  }
  if (config.analystGroups.some((group) => userGroups.has(group))) {
    return "analyst";
  }
  return "viewer";
}

/** required を満たすか (階層順序で比較)。 */
export function hasRole(user: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(user) >= ROLE_ORDER.indexOf(required);
}
