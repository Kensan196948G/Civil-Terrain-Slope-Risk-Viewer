# セキュリティポリシー

## 対象バージョン

本リポジトリは MVP 開発段階です。セキュリティ修正は既定ブランチ (`main`) に対して提供します。

| バージョン | サポート |
| ---------- | :------: |
| `main`     |    ✓     |
| それ以前   |    -     |

## 脆弱性の報告

脆弱性を発見した場合は、**公開 Issue を作成せず**、非公開で報告してください。

- GitHub の [Security Advisories](https://github.com/Kensan196948G/Civil-Terrain-Slope-Risk-Viewer/security/advisories/new)（プライベート報告）から連絡する。
- 応答目安: 3 営業日以内に受領を確認し、影響度に応じて修正計画を共有します。

報告には以下を含めてください。

- 影響を受けるコンポーネント / エンドポイント / コミット SHA
- 再現手順または PoC（最小限で可）
- 想定される影響（データ漏えい、権限昇格、DoS など）

## 対応の原則

- Critical / High は最優先で修正し、修正 PR に回帰テストを添付します。
- 秘密情報は Worker Secret / Binding で管理し、リポジトリ・ログ・PR に平文を残しません（詳細は [docs/セキュリティ.md](docs/セキュリティ.md)）。
- 依存関係の既知脆弱性は CI の `pnpm audit`、混入秘密は gitleaks、コードの脆弱パターンは semgrep で継続監視します（[.github/workflows/security.yml](.github/workflows/security.yml)）。

## 想定脅威と対策の概要

信頼境界・脅威モデル・認可設計は [docs/セキュリティ.md](docs/セキュリティ.md) を正本とします。主な対策は SSRF allowlist、パラメータ化 SQL、CSP / nosniff、位置情報の既定非保存、CSV 式インジェクション無害化です。
