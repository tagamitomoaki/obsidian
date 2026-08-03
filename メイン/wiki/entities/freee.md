---
type: entity
domain: [business]
created: 2026-08-03
updated: 2026-08-03
sources: ["[[Claude一般セッション 2026-06〜07]]", "[[ymsk-coreセッション 2026-07-05]]"]
tags: [会計, SaaS, 連携]
---

# freee

会計 SaaS。[[やまのすみか]]の**原価・会計の正本**であり、[[Yamasemi]] 構想で唯一「廃止しない」外部ツール。事業所: やまのすみか株式会社（本番）。

## 連携の構成

- **会計（読み取り専用）**: アプリ内 OAuth「freee から同期」ボタン方式。専用プライベートアプリを新設（CLIENT_ID の共用は スコープ共有・レート制限・ローテーション共倒れの理由で NG）。FREEE_SYNC_FROM=2024-01-01 で過去分取込
- **案件紐付け**: freee のメモタグ（現場名）↔ Yamasemi の案件。アーカイブ4案件をタグ紐付け登録済み。予実対比・消化率表示の実データ源
- **人事労務（書き込み）**: 勤怠打刻の送信（出勤・退勤のみ、15分毎 Vercel Cron、freee_employee_map で従業員紐付け）
- **MCP**: freee Remote MCP 接続済み（チャットから API 操作可）。freee-api-skill も導入済み

## 運用知識・ハマりどころ

- API: /tags は limit/offset ページネーション可（既定50・最大3000）。/deals は meta.total_count で完了判定。メモタグ（tag_ids）は取引明細行の中にあり一覧 API の絞込パラメータは無い → 案件別按分はクライアント側フィルタ
- 経費取引2,822件をチャット（MCP）経由で取り込むのは非現実的 → アプリ内 OAuth 同期方式へ転換した経緯
- OAuth コールバック URL に旧称（ymsk-core.vercel.app）が残っており、再認可時に yamasemi.vercel.app へ要更新
- Web 検索由来の API 情報は公式リファレンスで裏取りしてから使う（「/tags はページネーション不可」という誤情報をコード化する寸前だった）

関連: [[Yamasemi]] [[原価管理パイプライン]] [[やまのすみか]]
