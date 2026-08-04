import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const ARCHIVE_FORMAT_VERSION = 2;

function compareSnowflakes(a, b) {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertArchiveVersionSupported({ checkpointExists, archiveFormatVersion }) {
  if (!checkpointExists || archiveFormatVersion === ARCHIVE_FORMAT_VERSION) return;
  throw new Error('既存archiveはversion 2ではありません。別の出力先へ全件再取得してください。');
}

export async function messageFileIntegrity(file) {
  const hash = createHash('sha256');
  const seenMessageIds = new Set();
  let messageCount = 0;
  let latestMessageId = null;
  let remainder = '';

  const consumeLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      throw new Error('messages.jsonlに不正なJSONがあります。');
    }
    if (typeof message?.id !== 'string' || !/^\d{1,32}$/.test(message.id)) {
      throw new Error('messages.jsonlのMessage IDが不正です。');
    }
    if (seenMessageIds.has(message.id)) {
      throw new Error('messages.jsonlに重複Message IDがあります。');
    }
    seenMessageIds.add(message.id);
    messageCount += 1;
    if (latestMessageId == null || compareSnowflakes(message.id, latestMessageId) > 0) {
      latestMessageId = message.id;
    }
  };

  if (fs.existsSync(file)) {
    for await (const chunk of fs.createReadStream(file, { encoding: 'utf8' })) {
      hash.update(chunk);
      remainder += chunk;
      let newlineIndex = remainder.indexOf('\n');
      while (newlineIndex >= 0) {
        consumeLine(remainder.slice(0, newlineIndex));
        remainder = remainder.slice(newlineIndex + 1);
        newlineIndex = remainder.indexOf('\n');
      }
    }
  }
  consumeLine(remainder);

  return {
    messageCount,
    latestMessageId,
    contentSha256: hash.digest('hex'),
  };
}

export function assertExistingArchiveIntegrity({ entry, integrity, messageFileExists }) {
  if (entry == null) {
    if (messageFileExists || integrity.messageCount !== 0) {
      throw new Error('checkpointのない既存JSONLがあります。');
    }
    return;
  }
  if (
    typeof entry !== 'object'
    || Array.isArray(entry)
    || (entry.latestMessageId !== null && typeof entry.latestMessageId !== 'string')
    || (typeof entry.latestMessageId === 'string' && !/^\d{1,32}$/.test(entry.latestMessageId))
    || !Number.isInteger(entry.messageCount)
    || entry.messageCount < 0
    || !/^[a-f0-9]{64}$/.test(String(entry.contentSha256 ?? ''))
    || entry.latestMessageId !== integrity.latestMessageId
    || entry.messageCount !== integrity.messageCount
    || entry.contentSha256 !== integrity.contentSha256
  ) {
    throw new Error('既存archiveの件数またはSHA-256がcheckpointと一致しません。');
  }
}
