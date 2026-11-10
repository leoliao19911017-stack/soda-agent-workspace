#!/usr/bin/env node
/**
 * 用 Agent 自己的签名身份上报事件（L2/L3）。
 *
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs start "任务名" "开始执行"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs step  "任务名" "第 2 步：解析配置"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs cmd   "任务名" "npm run build"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs end   "任务名" "完成，产出 3 个文件"
 *
 * kind 可选：start / step / cmd / end / blocked / error / note
 * 同一进程内可用 `--batch` 模式从 stdin 读 NDJSON，一次提交多条。
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
if (!fs.existsSync(cfgFile) || !fs.existsSync(keyFile)) {
  console.error(`profile ${PROFILE} 还没接入：先跑一次 connect-start / connect-check`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const agentId = cfg.id || cfg.agentId;
if (!agentId) { console.error('profile 里没有 agent id'); process.exit(1); }
const key = crypto.createPrivateKey(fs.readFileSync(keyFile));

function sign(payload) {
  const stamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  const msg = `SODA-AGENT-SYNC-V2\nevents\n${agentId}\n${stamp}\n${nonce}\n${digest}`;
  const sig = crypto.sign(null, Buffer.from(msg), key).toString('base64url');
  return {
    'Content-Type': 'application/json',
    'x-soda-agent': agentId,
    'x-soda-time': stamp,
    'x-soda-nonce': nonce,
    'x-soda-signature': sig
  };
}

const [, , kind, task, detail] = process.argv;
if (!kind) {
  console.error('用法：node soda-event.mjs <kind> "<任务>" "<详情>"');
  process.exit(1);
}
const body = JSON.stringify({ events: [{ kind, task: task || '', detail: detail || '', at: new Date().toISOString() }] });
const res = await fetch(`${BASE}/api/agent-events`, { method: 'POST', headers: sign(body), body });
const out = await res.text();
if (!res.ok) { console.error('上报失败：HTTP ' + res.status + ' ' + out.slice(0, 200)); process.exit(2); }
console.log(out);
