# Log

追記専用の時系列ログ。直近5件は `grep "^## \[" log.md | tail -5` で取れる。

## [2026-08-03] setup | LLM Wiki 初期構築

- llm-wiki.md のパターンに従い、raw/ + wiki/ + index.md + log.md + CLAUDE.md（スキーマ）を構築
- ドメイン: research（リサーチ・学習）/ business（事業・業務）/ personal（パーソナル）の3つを単一ボールトで運用
- ソースはまだ0件

## [2026-08-03] setup | GitHub バックアップ設定

- 個人アカウントの private repo（tagamitomoaki/obsidian）を remote に設定し push
- このリポジトリのコミット識別情報は個人 gmail（会社アカウントとは分離）
- 方針: この wiki は会社アカウントには置かない。事業部分のチーム共有が必要になったら business ページのみ抽出して会社リポジトリへ

## [2026-08-03] ingest | Claude Code セッション履歴（3プロジェクト・生ログ94MB）

- 対象: Claude一般（58セッション）・swing-trade（7セッション）・ymsk-core（1セッション）。生ログはローカルに残し、蒸留結果のみ wiki 化
- 手順: jsonl を会話テキストに凝縮（94MB→2.1MB）→ サブエージェント8体で分担蒸留 → memory ディレクトリ（蒸留済み知識）と突き合わせて執筆
- 作成: sources 3・entities 7・concepts 6 の計16ページ。index 全面更新
- 特記: 顧客個人情報はスキーマに従い非収録（実案件データは「実案件デモデータ」等で参照）

## [2026-08-03] query | QUEUE 初処理: N8N 検討まとめ

- QUEUE の依頼メモ「N8N検討まとめ依頼」を処理（QUEUE 運用の通しテスト）
- 成果物: [[自動化の実行層検討（N8N見送り）]] を wiki/notes/ に作成、index 登録
- QUEUE → 実行 → notes → index/log → push の全行程を確認

## [2026-08-03] setup | Codex と Claude の情報共有入口を追加

- Codex が共通スキーマを確実に読むため、リポジトリ直下に `AGENTS.md` を追加
- `CLAUDE.md` を全エージェント共通規約の正本とし、規約の二重管理を避ける構成にした
- Notes に [[CodexとClaudeの情報共有運用]] を追加し、引継ぎ単位・レビュー分担・保存境界・読込順を明文化
