#!/usr/bin/env node
/**
 * 用 Agent 自己的签名身份上报事件（L2/L3）。
 *
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs start "任务名" "开始执行"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs step  "任务名" "第 2 步：解析配置"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs cmd   "任务名" "npm run build"
 *   SODA_AGENT_PROFILE=lemate node soda-event.mjs end   "任务名" "完成，产出 3 个文件"
 *
 * 批量模式：从 stdin 读 NDJSON，每行 {kind,task,detail}，最多 100 条；
 * 超过 16000 字节会自动分多次签名上报（服务端单请求体上限 20000 字节）：
 *   cat events.ndjson | SODA_AGENT_PROFILE=lemate node soda-event.mjs --batch
 *
 * kind 可选：start / step / cmd / end / blocked / error / note
 * 退出码：0 成功 / 1 失败（参数错误、网络超时、服务端拒绝都算失败）。
 * 注意：超时可能「其实已送达」（服务端有 nonce 防重放），不要对同一批数据自动重试。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = process.env.SODA_BASE || 'https://soda-ai-studio.ai-soda.com';
const PROFILE = process.env.SODA_AGENT_PROFILE || '';
if (!PROFILE) { console.error('缺少 SODA_AGENT_PROFILE'); process.exit(1); }

const KINDS = ['start', 'step', 'cmd', 'end', 'blocked', 'error', 'note'];
const MAX_BATCH = 100;

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

/** 一次签名 POST 上报一批事件；成功退出 0，任何失败退出 1 */
async function post(events) {
  const body = JSON.stringify({ events });
  let res;
  try {
    res = await fetch(`${BASE}/api/agent-events`, {
      method: 'POST',
      headers: sign(body),
      body,
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('上报失败：' + (timedOut ? '请求超时（8 秒），该批可能已送达，勿盲目重发' : (e.message || String(e))));
    process.exit(1);
  }
  const out = await res.text();
  if (!res.ok) { console.error('上报失败：HTTP ' + res.status + ' ' + out.slice(0, 200)); process.exit(1); }
  console.log(out);
}

/** 校验并归一一条事件为 {kind,task,detail,at}；kind 非法直接报错退出 */
function oneEvent(e, where) {
  const kind = String(e && e.kind || '').toLowerCase();
  if (!KINDS.includes(kind)) {
    console.error(`${where} kind 非法：${kind || '(空)'}（可选 ${KINDS.join(' / ')}）`);
    process.exit(1);
  }
  return { kind, task: e.task || '', detail: e.detail || '', at: new Date().toISOString() };
}

if (process.argv[2] === '--batch') {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const lines = Buffer.concat(chunks).toString('utf8').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) { console.error('--batch 需要 stdin 提供 NDJSON，每行 {kind,task,detail}'); process.exit(1); }
  if (lines.length > MAX_BATCH) console.error(`注意：${lines.length} 行超过上限 ${MAX_BATCH}，只上报前 ${MAX_BATCH} 条`);
  const events = [];
  for (let i = 0; i < Math.min(lines.length, MAX_BATCH); i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { console.error(`第 ${i + 1} 行不是合法 JSON：${lines[i].slice(0, 120)}`); process.exit(1); }
    events.push(oneEvent(e, `第 ${i + 1} 行`));
  }
  // 服务端 rawBody 上限 20000 字节：按字节再切一刀，每批 ≤16000 字节，多批各自签名上报。
  // （条数限制与字节限制是双约束：100 条是服务端单批上限，16000 字节是防 413 的安全余量。）
  const MAX_BYTES = 16000;
  const batches = [];
  let cur = [], curBytes = 0;
  for (const ev of events) {
    const sz = Buffer.byteLength(JSON.stringify(ev), 'utf8') + 2;
    if (cur.length && curBytes + sz > MAX_BYTES) { batches.push(cur); cur = []; curBytes = 0; }
    cur.push(ev); curBytes += sz;
  }
  if (cur.length) batches.push(cur);
  for (const b of batches) await post(b);
} else {
  const [, , kind, task, detail] = process.argv;
  if (!kind) {
    console.error('用法：node soda-event.mjs <kind> "<任务>" "<详情>"');
    console.error('批量：node soda-event.mjs --batch < events.ndjson（每行 {kind,task,detail}，最多 100 条）');
    process.exit(1);
  }
  await post([oneEvent({ kind, task, detail }, '参数')]);
}
