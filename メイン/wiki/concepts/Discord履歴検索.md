---
type: concept
domain: [business, research]
created: 2026-08-04
updated: 2026-08-04
sources: ["yamanosumika/yamasemi Issue #24", "https://github.com/yamanosumika/yamasemi/pull/25", "yamanosumika/yamasemi docs/discord-knowledge-search-design.md", "yamanosumika/yamasemi docs/session-handoff-20260804-discord-search.md"]
tags: [discord, 検索, RLS, AI, ナレッジ]
---

# Discord履歴検索

Discordのチャンネルやスレッドを人手で遡る作業を、[[Yamasemi]]内の権限付き検索で短縮する設計。

旧チャット機能を復活させず、Discordを原文の正本、Supabaseを読取専用の検索ミラーとして分離する。

## 現在状態

2026-08-04に`feature/discord-knowledge-search`でコード実装し、Draft PR #25を作成した。

追跡元は`yamanosumika/yamasemi`のIssue #24とPR #25、設計の正本は`docs/discord-knowledge-search-design.md`である。

本番migration適用、実ログ取込、実RLS検証、Vercel環境変数設定は未実施。

したがって、現時点では本番で検索できない。

## 設計判断

### 専用ミラー

Discordメッセージは`knowledge_pages`へ混載しない。

メッセージID、返信、スレッド、編集日時、Discord原文リンク、差分同期を保持するため、専用のチャンネル表、メッセージ表、同期状態表、検索監査表を使う。

顧客対応履歴の原文はObsidian Wikiへ複製しない。

このWikiには横断的に再利用できる設計判断だけを同期する。

### Fail closed

取込直後のチャンネルは`search_enabled=false`、`ai_enabled=false`、`restricted`とする。

管理者が検索対象を明示承認するまで、管理者自身にもメッセージを返さない。

`restricted`は管理者限定、`internal`は認証済み社内ユーザー向けである。

案件紐付けは検索条件であり、認可根拠にしない。

同期scriptはDiscord由来列だけを更新でき、検索公開状態、外部AI送信許可、案件紐付けを変更できない。

この分離は[[開発原則]]の「認証と認可は別」「途中状態を安全側へ倒す」を具体化している。

### 検索の残留を減らす

検索語はURLへ置かず、認証済みのPOST Route Handlerへ送る。

監査には検索語本文もfingerprintも置かない。

DBが確定した利用者、フィルター、返却件数、AI用検索の要求有無、時刻だけを保存する。

成功して結果を返した検索は検索と同じtransactionで監査するが、timeoutやSQL errorでrollbackした試行は別の基盤監視が必要である。

検索結果はキャッシュせず、Discord原文URLは保存値ではなく3つのDiscord IDから生成する。

### AI回答は別ゲート

通常検索はOpenAI APIなしで動く。

AI回答は利用者の明示操作、全体feature flag、チャンネルごとの`ai_enabled=true`がすべて揃った場合だけ実行する。

全履歴取込済みで直近同期エラーがないチャンネルだけをAI証拠候補にする。

送信対象は検索語、RLS通過後の本文断片、日時だけとする。

チャンネル名、案件名、投稿者表示名、Discord ID、添付情報、raw payload、Bot token、service role keyは含めない。

代表的な秘密値形式、メールアドレス、電話番号、郵便番号は送信前にマスクし、Responses APIへは`store:false`を指定する。

採用証拠の範囲外にある根拠番号と根拠なしの断定は拒否する。

実際にモデルへ送ったメッセージだけ、回答の`[n]`と画面上の根拠カードを対応させ、AI回答を原文の代わりにしない。

## 既存原則との未解決な緊張

[[開発原則]]には「施主情報はAIに渡すデータから除く」と記録されている。

一方、この機能の任意AI回答は、許可された顧客対応ログの一部をOpenAI APIへ送る可能性がある。

両者はそのままでは両立しない。

コード上はfeature flagを既定で無効にし、通常検索だけを独立利用できるようにした。

AI回答を本番で有効にする前に、利用目的、委託先、保持条件、社内権限を本人が確認し、[[開発原則]]を変更するか、顧客情報を除外する境界を追加する必要がある。

## 同期方式と限界

初回はローカルarchiveから取込でき、以後はDiscord APIをページングして差分同期できる。

ライブ同期前にMessage Content IntentのApplication flagを確認し、HTTP requestはtimeoutと上限付きretryを使う。

初期版はcronと常駐workerを持たず、scriptを手動実行した時点までの同期である。

SnowflakeはJavaScriptのnumberへ変換せず文字列のまま扱う。

添付はファイル名、Content-Type、サイズだけを保存する。

REST pollingでは削除イベントを検出できず、最新ページより古いメッセージの後日編集も追えない。

全履歴未取込または直近同期エラーは検索画面へ表示し、そのチャンネルをAI回答から除外する。

完全追従にはDiscord Gateway workerが必要である。

既存archiveのdry-runでは不正JSONL 5行と履歴不一致6チャンネルが見つかり、実取込前の再取得が必要になった。

## 再利用できる原則

外部業務ログのAI検索は、取得、保存、検索、AI回答を一つの権限で束ねない。

取得Botが読める範囲は、社内利用者へ公開してよい範囲を意味しない。

まず読取専用検索だけを成立させ、外部AI送信は別のfeature flagと運用承認へ分ける。

要約だけでなく原文への導線を残し、同期の欠落を隠さない。

関連: [[Yamasemi]] [[開発原則]] [[業務ツールの導入と撤退]] [[CodexとClaudeの情報共有運用]]
