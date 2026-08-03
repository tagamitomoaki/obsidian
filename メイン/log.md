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
