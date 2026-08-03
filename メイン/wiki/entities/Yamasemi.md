---
type: entity
domain: [business]
created: 2026-08-03
updated: 2026-08-04
sources: ["[[Claude一般セッション 2026-06〜07]]", "[[ymsk-coreセッション 2026-07-05]]", "[[Discord業務ログ 2022〜2026]]"]
tags: [yamasemi, システム, 開発]
---

# Yamasemi

[[やまのすみか]]の業務統合システム。**旧称 ymsk-core**（2026-07-16 に改名。旧称は使わない）。Next.js（App Router/TS/Tailwind）+ Supabase（Postgres/Auth/Storage/Realtime、東京）+ Vercel。GitHub は yamanosumika/yamasemi（Private）、本番 URL は yamasemi.vercel.app。

## 目的と4段階計画

課題「原価掌握の後手」の真因 = [[freee]]→サクミルへの手転記。freee を会計正本に残し、他ツールを段階的に自作統合する。各段階の完成で旧ツールを廃止する。

## 前史

Discordの業務ログには、2023年の現場Plus導入、2024年の工務店向けSaaS比較、2025年の原価管理サービス運用、2026年の自作移行が連続して記録されている。
既製品の機能不足だけが問題だったのではない。
自社の実行予算起点フローとの不一致、freeeとの二重入力、社外利用者の負担、少棟数での費用対効果が重なり、段階的な自作統合へ移った。
この経緯は[[業務ツールの導入と撤退]]に整理する。

| 段階 | 内容 | 廃止対象 | 状態（2026-08-03） |
|---|---|---|---|
| 1 | 階層見積→実行予算→予実（→ [[原価管理パイプライン]]） | サクミル | 中核。本番稼働・機能拡充中 |
| 2 | タスク管理 | Todoist | 叩き台あり（イベント導出型 task_events）。[[西永さん]]が別プロトタイプも開発。タスクの母集団は [[注文住宅の業務プロセス]]（WBS）が定義 |
| 3 | 情報管理 | Notion | 受入基盤（knowledge_pages）マージ済み |
| 4 | 施工管理（写真・工程・現場） | 現場プラス | 叩き台あり（工程表・現場写真・現場ポータル） |

## 主要機能（2026-08 時点）

- 階層見積グリッド（工種→中分類→明細、Alt+S/Alt+G/Alt+N、Ctrl+K 単価マスタ検索、数量/単位分離、CSV入出力、差分見積、標準タクソノミーテンプレート）
- 確定フロー: 原価妥当性ダイアログ→承認ゲート（decide_estimate_approval は DB レベルで管理者限定）→計上漏れチェック（初期23項目）→confirm_estimate
- 実行予算・予実（freee 品目別対比・消化率・予算外品目検知の全幅アコーディオン1表。この画面がデザインシステムの基準画面）
- 発注書（draft→issued→cancelled、発注済み削除不可）、監査ログ、行単位楽観ロック+プレゼンス表示
- 顧客・物件・契約台帳（施主プロフィール・問い合わせ経緯・GoogleMap 対応）、契約PDF不変保存
- 認証: 招待制（公開サインアップなし）+ TOTP 2FA 三層強制 + ユーザー管理画面 /users
- 勤怠打刻（/punch PWA、追記専用台帳 attendance_events・赤伝方式、freee 人事労務へ15分毎 cron 送信）
- BIM/IFC 取込（基準面積6種プリフィル・建具展開）、社内チャット /chat、職人ボード /workers、現場ポータル
- UI: ブランドパレット v0.2（ダストブルー/セージ/アンバー/コーラル）、ダッシュボードにヤギと鶏の装飾

## 撤去したもの

- **社外チャット（LINE/Chatwork 中継・メール取込）**: 2026-07-19 本人決定で恒久撤去（migration 20260735、データごと DROP）。LINE WORKS のログ監視へ方針転換（未設計）。社内チャットは温存

## 運用ルール（人間が握る関所）

- migration は本人が Supabase SQL Editor で番号順に手動適用（冪等 SQL・未適用でも壊れない probe 設計が前提）。データ破棄を含むものは事前に `yamasemi-backups\backup-prod.ps1`（pg_dump）
- main へのマージ承認・シークレット登録・実ユーザーへの admin 付与も本人のみ
- push 前に `npm run build` 必須（lint/test では Vercel ビルドエラーを検出できない）。デプロイ確認は Vercel CLI
- 検証ユーザーを本番 Auth に作らない。プレビューも本番 DB 共有のためテストデータは「TEST-」命名→削除
- 共有ワーキングコピー（Documents\yamasemi + yamasemi-worktrees）は本人・Codex が並行操作するため、コミット直前のブランチ確認必須

## 未解決・保留

- ロール設計: admin/general の2段階のまま。**案件単位のアクセス境界がない**（RLS ほぼ using(true)）ため、スタッフ10名超 or 社外アカウント発行がトリガー
- ステージング環境（staging ブランチ+無料 Org の検証用 Supabase）: 設計済み・構築は未了
- LINE WORKS ログ監視の設計、freee 原価実績の cost_actuals 本実装、GLOOBE 本番パーサー（IfcOpenShell+Cloud Run、FR-7 改訂指示書待ち）
- Vercel Hobby→Pro 化の推奨が出ている（業務利用の規約・ログ保持・cron 制約）

関連: [[やまのすみか]] [[原価管理パイプライン]] [[業務ツールの導入と撤退]] [[AI協業開発体制]] [[開発原則]] [[freee]] [[Codex]] [[西永さん]]
