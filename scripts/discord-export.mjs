import fs from 'node:fs';
import path from 'node:path';
import {
  ARCHIVE_FORMAT_VERSION,
  assertArchiveVersionSupported,
  assertExistingArchiveIntegrity,
  messageFileIntegrity,
} from './discord-archive-integrity.mjs';

const API_BASE = 'https://discord.com/api/v10';
const MESSAGE_CHANNEL_TYPES = new Set([0, 2, 5, 13]);
const THREAD_PARENT_TYPES = new Set([0, 5, 15, 16]);
const THREAD_TYPES = new Set([10, 11, 12]);
const MAX_RETRIES = 6;

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.renameSync(temporary, file);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
      try {
        fs.copyFileSync(temporary, file);
        fs.rmSync(temporary, { force: true });
        return;
      } catch (copyError) {
        lastError = copyError;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
  throw lastError;
}

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 160) || 'attachment';
}

function compareSnowflakes(a, b) {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

const repositoryRoot = process.cwd();
const fileEnv = parseEnvFile(path.join(repositoryRoot, '.env.local'));
const config = { ...fileEnv, ...process.env };
const token = config.DISCORD_BOT_TOKEN;
const guildId = config.DISCORD_GUILD_ID;
const downloadAttachments = String(config.DISCORD_DOWNLOAD_ATTACHMENTS).toLowerCase() === 'true';
const outputRoot = path.resolve(repositoryRoot, config.DISCORD_OUTPUT_ROOT || 'メイン/raw/discord');

if (!token || !guildId) {
  console.error('DISCORD_BOT_TOKEN と DISCORD_GUILD_ID を .env.local に設定してください。');
  process.exit(2);
}

async function discordRequest(endpoint, attempt = 0) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'ObsidianDiscordArchive/1.0',
    },
  });

  if (response.status === 429 && attempt < MAX_RETRIES) {
    const body = await response.json().catch(() => ({}));
    const retryAfterMs = Math.ceil(Number(body.retry_after || 1) * 1000) + 250;
    await sleep(retryAfterMs);
    return discordRequest(endpoint, attempt + 1);
  }

  if (response.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(500 * 2 ** attempt);
    return discordRequest(endpoint, attempt + 1);
  }

  if (!response.ok) {
    const error = new Error(`Discord API ${response.status}: ${endpoint}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function listArchivedThreads(channelId, kind) {
  const collected = [];
  let before;
  while (true) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const endpoint = kind === 'joined-private'
      ? `/channels/${channelId}/users/@me/threads/archived/private?${query}`
      : `/channels/${channelId}/threads/archived/public?${query}`;
    const page = await discordRequest(endpoint);
    collected.push(...page.threads);
    if (!page.has_more || page.threads.length === 0) break;
    const last = page.threads.at(-1);
    before = kind === 'joined-private' ? last.id : last.thread_metadata.archive_timestamp;
  }
  return collected;
}

async function enumerateThreads(channels, report) {
  const byId = new Map();
  const active = await discordRequest(`/guilds/${guildId}/threads/active`);
  for (const thread of active.threads) byId.set(thread.id, thread);

  for (const channel of channels.filter((item) => THREAD_PARENT_TYPES.has(item.type))) {
    const kinds = channel.type === 0 ? ['public', 'joined-private'] : ['public'];
    for (const kind of kinds) {
      try {
        const threads = await listArchivedThreads(channel.id, kind);
        for (const thread of threads) byId.set(thread.id, thread);
      } catch (error) {
        if (![403, 404].includes(error.status)) throw error;
        report.threadEnumerationWarnings.push({ channelId: channel.id, kind, status: error.status });
      }
    }
  }
  return [...byId.values()];
}

async function fetchNewMessages(channelId, checkpointId) {
  const messages = [];
  let before;
  while (true) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const page = await discordRequest(`/channels/${channelId}/messages?${query}`);
    if (page.length === 0) break;

    let reachedCheckpoint = false;
    for (const message of page) {
      if (checkpointId && compareSnowflakes(message.id, checkpointId) <= 0) {
        reachedCheckpoint = true;
        continue;
      }
      messages.push(message);
    }

    if (reachedCheckpoint || page.length < 100) break;
    before = page.at(-1).id;
  }
  messages.sort((a, b) => compareSnowflakes(a.id, b.id));
  return messages;
}

async function downloadAttachment(attachment, messageId, destination) {
  const filename = `${messageId}-${attachment.id}-${safeFilename(attachment.filename)}`;
  const target = path.join(destination, filename);
  if (fs.existsSync(target)) return false;
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`Attachment HTTP ${response.status}: ${attachment.id}`);
  fs.mkdirSync(destination, { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temporary, target);
  return true;
}

const startedAt = new Date().toISOString();
const guildRoot = path.join(outputRoot, guildId);
const checkpointFile = path.join(guildRoot, 'checkpoint.json');
const checkpointExists = fs.existsSync(checkpointFile);
const checkpoint = checkpointExists
  ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
  : { archiveFormatVersion: ARCHIVE_FORMAT_VERSION, guildId, channels: {} };
assertArchiveVersionSupported({ checkpointExists, archiveFormatVersion: checkpoint.archiveFormatVersion });
const archiveWasVersion2 = checkpoint.archiveFormatVersion === ARCHIVE_FORMAT_VERSION;
if (checkpoint.channels == null || typeof checkpoint.channels !== 'object' || Array.isArray(checkpoint.channels)) {
  throw new Error('checkpoint.json の channels が不正です。');
}
checkpoint.archiveFormatVersion = ARCHIVE_FORMAT_VERSION;
checkpoint.guildId = guildId;
const report = {
  archiveFormatVersion: ARCHIVE_FORMAT_VERSION,
  startedAt,
  finishedAt: null,
  guildId,
  guildName: null,
  downloadAttachments,
  guildChannelCount: 0,
  threadCount: 0,
  processedChannelCount: 0,
  newMessageCount: 0,
  downloadedAttachmentCount: 0,
  channelErrors: [],
  attachmentErrors: [],
  threadEnumerationWarnings: [],
};

const guild = await discordRequest(`/guilds/${guildId}`);
const channels = await discordRequest(`/guilds/${guildId}/channels`);
report.guildName = guild.name;
report.guildChannelCount = channels.length;
const threads = await enumerateThreads(channels, report);
report.threadCount = threads.length;

fs.mkdirSync(guildRoot, { recursive: true });
atomicWriteJson(path.join(guildRoot, 'guild.json'), {
  archiveFormatVersion: ARCHIVE_FORMAT_VERSION,
  id: guild.id,
  name: guild.name,
  exportedAt: startedAt,
});
atomicWriteJson(path.join(guildRoot, 'channels.json'), {
  archiveFormatVersion: ARCHIVE_FORMAT_VERSION,
  exportedAt: startedAt,
  channels,
  threads,
});

const messageChannels = [
  ...channels.filter((channel) => MESSAGE_CHANNEL_TYPES.has(channel.type)),
  ...threads.filter((thread) => THREAD_TYPES.has(thread.type)),
];

for (const channel of messageChannels) {
  const channelRoot = path.join(guildRoot, 'messages', channel.id);
  const messageFile = path.join(channelRoot, 'messages.jsonl');
  const attachmentRoot = path.join(guildRoot, 'attachments', channel.id);
  const previousEntry = checkpoint.channels[channel.id];
  const previous = previousEntry?.latestMessageId;
  try {
    if (archiveWasVersion2) {
      const existingIntegrity = await messageFileIntegrity(messageFile);
      assertExistingArchiveIntegrity({
        entry: previousEntry,
        integrity: existingIntegrity,
        messageFileExists: fs.existsSync(messageFile),
      });
    }
    const messages = await fetchNewMessages(channel.id, previous);
    fs.mkdirSync(channelRoot, { recursive: true });
    atomicWriteJson(path.join(channelRoot, 'channel.json'), {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parent_id || null,
    });

    if (messages.length > 0) {
      const body = `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
      if (previous) fs.appendFileSync(messageFile, body, 'utf8');
      else fs.writeFileSync(messageFile, body, 'utf8');
      report.newMessageCount += messages.length;

      if (downloadAttachments) {
        for (const message of messages) {
          for (const attachment of message.attachments || []) {
            try {
              if (await downloadAttachment(attachment, message.id, attachmentRoot)) {
                report.downloadedAttachmentCount += 1;
              }
            } catch (error) {
              report.attachmentErrors.push({
                channelId: channel.id,
                messageId: message.id,
                attachmentId: attachment.id,
                error: error.message,
              });
            }
          }
        }
      }
    }

    const integrity = await messageFileIntegrity(messageFile);
    checkpoint.channels[channel.id] = {
      latestMessageId: integrity.latestMessageId,
      lastSyncedAt: new Date().toISOString(),
      messageCount: integrity.messageCount,
      contentSha256: integrity.contentSha256,
    };

    report.processedChannelCount += 1;
    atomicWriteJson(checkpointFile, checkpoint);
  } catch (error) {
    report.channelErrors.push({ channelId: channel.id, status: error.status || null, error: error.message });
  }
}

report.finishedAt = new Date().toISOString();
atomicWriteJson(path.join(guildRoot, 'report.json'), report);
console.log(JSON.stringify({
  guildId: report.guildId,
  guildName: report.guildName,
  guildChannelCount: report.guildChannelCount,
  threadCount: report.threadCount,
  processedChannelCount: report.processedChannelCount,
  newMessageCount: report.newMessageCount,
  downloadedAttachmentCount: report.downloadedAttachmentCount,
  channelErrorCount: report.channelErrors.length,
  attachmentErrorCount: report.attachmentErrors.length,
  threadWarningCount: report.threadEnumerationWarnings.length,
  outputRoot,
}, null, 2));

if (report.channelErrors.length > 0) process.exitCode = 1;
