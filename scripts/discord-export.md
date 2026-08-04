# Discordログ取得

管理しているDiscordサーバーの閲覧可能なチャンネルとスレッドを、ローカルの `メイン/raw/discord/` へ保存する。
生ログは顧客情報やスタッフの発言を含み得るためGit管理外とし、wikiへは必要な情報だけを個人情報除去後に蒸留する。

## 設定

リポジトリ直下の `.env.local` に設定する。このファイルはGit管理外。

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=1017406224062492752
DISCORD_DOWNLOAD_ATTACHMENTS=true
```

Botには対象チャンネルの `View Channels` と `Read Message History` を与える。
音声チャンネル内のテキストも取得する場合は `Connect` も与える。

## 実行

Node.js 18以降で、リポジトリのルートから実行する。

```powershell
node scripts/discord-export.mjs
```

初回は閲覧可能な全履歴を取得する。
2回目以降は `checkpoint.json` のMessage IDまで遡り、それより新しいメッセージだけをJSONLへ追記する。
Discord APIの429応答は待機して再試行する。

各実行では、全message channelについて`checkpoint.json`をarchive format version 2へ更新する。

checkpointは最新Message IDに加え、JSONLのmessage件数、SHA-256、今回の同期時刻を保持する。

Yamasemi取込前のpreflightはこれらを照合し、途中行の欠落やファイル破損を検出する。

2回目以降の取得では、各チャンネルのmessage差分APIを呼ぶ前に既存JSONLを前回checkpointへ照合する。

不一致なら当該チャンネルへ差分を追記せず、archive全体をエラー状態にする。

version 1の既存archiveは自動更新しない。

別の出力先へ全件再取得する。

## 出力

```text
メイン/raw/discord/<サーバーID>/
  guild.json
  channels.json
  checkpoint.json
  report.json
  messages/<チャンネルID>/channel.json
  messages/<チャンネルID>/messages.jsonl
  attachments/<チャンネルID>/...
```

`report.json` に取得失敗、添付失敗、スレッド列挙時の権限不足を記録する。
非公開スレッドはBotが参加していない場合、取得対象にならないことがある。

## 秘密情報

- Botトークンをチャット、スクリーンショット、wiki、GitHubへ貼らない
- トークンが表示された場合は即時リセットする
- `メイン/raw/discord/` をGitへ追加しない
