import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertArchiveVersionSupported,
  assertExistingArchiveIntegrity,
  messageFileIntegrity,
} from './discord-archive-integrity.mjs';

test('version 2以外の既存archiveをbaseline化しない', () => {
  for (const archiveFormatVersion of [undefined, 1, 3, '2', null]) {
    assert.throws(() =>
      assertArchiveVersionSupported({ checkpointExists: true, archiveFormatVersion })
    );
  }
  assert.doesNotThrow(() =>
    assertArchiveVersionSupported({ checkpointExists: false, archiveFormatVersion: undefined })
  );
  assert.doesNotThrow(() =>
    assertArchiveVersionSupported({ checkpointExists: true, archiveFormatVersion: 2 })
  );
});

test('既存version 2 archiveの件数・最新ID・SHA-256を照合する', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-archive-integrity-'));
  try {
    const file = path.join(root, 'messages.jsonl');
    const body = `${JSON.stringify({ id: '1', content: '前半\u2028後半' })}\n${JSON.stringify({ id: '2' })}\n`;
    fs.writeFileSync(file, body, 'utf8');
    const integrity = await messageFileIntegrity(file);
    assert.deepEqual(integrity, {
      messageCount: 2,
      latestMessageId: '2',
      contentSha256: createHash('sha256').update(body).digest('hex'),
    });
    assert.doesNotThrow(() =>
      assertExistingArchiveIntegrity({
        entry: { latestMessageId: '2', messageCount: 2, contentSha256: integrity.contentSha256 },
        integrity,
        messageFileExists: true,
      })
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('既存JSONLの改変と重複IDを拒否する', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-archive-integrity-'));
  try {
    const file = path.join(root, 'messages.jsonl');
    fs.writeFileSync(file, `${JSON.stringify({ id: '1', content: '変更後' })}\n`, 'utf8');
    const integrity = await messageFileIntegrity(file);
    assert.throws(() =>
      assertExistingArchiveIntegrity({
        entry: {
          latestMessageId: '1',
          messageCount: 1,
          contentSha256: createHash('sha256').update('変更前').digest('hex'),
        },
        integrity,
        messageFileExists: true,
      })
    );

    fs.writeFileSync(file, `${JSON.stringify({ id: '1' })}\n${JSON.stringify({ id: '1' })}\n`, 'utf8');
    await assert.rejects(messageFileIntegrity(file), /重複Message ID/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
