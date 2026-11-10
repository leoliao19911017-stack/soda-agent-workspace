#!/usr/bin/env node
/**
 * 最便宜的状态心跳：一次 HTTP 请求，只更新一行字段。
 *
 *   SODA_AGENT_PROFILE=cortana node soda-ping.mjs working "正在整理周报"
 *   SODA_AGENT_PROFILE=cortana node soda-ping.mjs idle ""
 *
 * 与 sync 的区别：
 *   sync = 上报 + 写一条工作记录（有摘要时）——用于任务完成，会产生数据
 *   ping = 只更新「它什么时候还活着」——用于心跳，不产生任何记录行
 *
 * 适合放在 cron / systemd timer 里，每 5–15 分钟跑一次。
 * 成本：一次 ~200 字节的 HTTPS 请求，服务端一次 UPDATE，零记录增长。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = process.env.SODA_BASE || 'https://soda-ai-studio.ai-soda.com';
const PROFILE = process.env.SODA_AGENT_PROFILE || '';
if (!PROFILE) { console.error('缺少 SODA_AGENT_PROFILE'); process.exit(1); }

const dir = path.join(os.homedir(), '.config', 'soda-agent-sync', 'profiles', PROFILE);
const cfgFile = path.join(dir, 'config.json');
const keyFile = path.join(dir, 'private.pem');
if (!fs.existsSync(cfgFile) || !fs.existsSync(keyFile)) { console.error('profile 未接入'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const agentId = cfg.id || cfg.agentId;
const key = crypto.createPrivateKey(fs.readFileSync(keyFile));

const [, , status = 'working', task = ''] = process.argv;
if (!['working', 'idle', 'blocked', 'done'].includes(status)) {
  console.error('状态必须是 working / idle / blocked / done');
  process.exit(1);
}

const body = JSON.stringify({ status, task });
const stamp = String(Date.now());
const nonce = crypto.randomBytes(16).toString('hex');
const digest = crypto.createHash('sha256').update(Buffer.from(body)).digest('hex');
const msg = `SODA-AGENT-SYNC-V2\nping\n${agentId}\n${stamp}\n${nonce}\n${digest}`;
const sig = crypto.sign(null, Buffer.from(msg), key).toString('base64url');

let res;
try {
  res = await fetch(`${BASE}/api/agent-ping`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-soda-agent': agentId,
      'x-soda-time': stamp,
      'x-soda-nonce': nonce,
      'x-soda-signature': sig
    },
    body,
    signal: AbortSignal.timeout(8000)
  });
} catch (e) {
  const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
  console.error('心跳失败：' + (timedOut ? '请求超时（8 秒）' : (e.message || String(e))));
  process.exit(2);
}
const text = await res.text();
if (!res.ok) { console.error('心跳失败 HTTP ' + res.status + ' ' + text.slice(0, 150)); process.exit(2); }
console.log(text);
