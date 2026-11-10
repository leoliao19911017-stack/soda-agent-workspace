#!/usr/bin/env node
/**
 * soda-hook —— Claude Code 钩子适配器：把 Claude Code 的 hook 调用（stdin JSON）
 * 翻译成 Soda AI Studio 的上报（事件 + 心跳），并负责写 current_task 喂给 autopilot。
 *
 * 一、stdin 模式（默认，由 Claude Code hooks 调起，不需要手动跑）
 *   Claude Code 把 hook payload 从 stdin 传入，关键字段：
 *   hook_event_name / prompt / tool_name / tool_input。
 *   - UserPromptSubmit：prompt 首行（≤80 字符）当任务标签；写 current_task；
 *     发 start 事件（task=标签, detail=会话新任务），节流 ≥60 秒一条
 *   - PostToolUse：tool_name + 摘要当标签（总长 ≤200）；每次都写 current_task；
 *     cmd 事件节流 ≥90 秒一条（detail=工具调用 x累计次数）；
 *     顺带 ping working（task=当前标签），节流 ≥120 秒一次
 *   - Stop / SessionEnd：读 current_task，存在则发 end 事件（detail=回合结束，
 *     回合边界不节流）；删 current_task；发 ping idle（不节流）
 *   - 其他 hook_event_name 一律忽略
 *   - 发送前客户端脱敏（--token/--key/--password、sk-/pk-/ghp_/xoxb 前缀、
 *     KEY/TOKEN/PASSWORD 形态的值都替换成 ***），服务端还会兜底涂改一次
 *   - 网络失败绝不自动重试：服务端 nonce 防重放，超时可能已送达
 *   - 任何失败都不打断会话：退出码恒为 0，错误进 <profile>/hook-errors.log
 *     （追加写，超 50 行截断保留末 50 行）
 *
 * 二、profile 解析顺序（全部静默，找不到就退出，绝不报错）
 *   环境变量 SODA_AGENT_PROFILE
 *   → ~/.config/soda-agent-sync/hook-profile 文件（单行 profile 名）
 *   → profiles/ 下恰好只有一个目录则用它
 *   → 否则退出；profile 目录缺 config.json 或 private.pem 也退出
 *
 * 三、CLI 子命令
 *   node soda-hook.mjs install [--write] [--profile 名字]
 *     打印 Claude Code settings.json 的 hooks 配置片段（command 指向本脚本）。
 *     --profile 或自动探测（仅一个 profile 时）确定身份并写入 hook-profile 文件。
 *     --write 时：先备份 ~/.claude/settings.json（存在则复制为
 *     settings.json.soda-bak-<时间戳>），再 JSON 解析合并 hooks 字段（保留已有
 *     其他 hook 配置；UserPromptSubmit/PostToolUse/Stop 三个键逐键追加，相同
 *     command 已存在则跳过）。未 --write 时只打印片段和提示。
 *   node soda-hook.mjs status
 *     显示 profile、hook-state.json 摘要、current_task 内容、hook-errors.log 末尾。
 *
 * 四、环境变量
 *   SODA_BASE           服务地址（默认 https://soda-ai-studio.ai-soda.com）
 *   SODA_AGENT_PROFILE  指定 profile（优先级最高）
 *   SODA_HOOK_DEBUG=1   调试信息走 stderr
 *
 * 零依赖：只用 node 内置模块，Node >= 18 可跑。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------- 常量 ----------
const BASE = process.env.SODA_BASE || 'https://soda-ai-studio.ai-soda.com';
const ROOT = path.join(os.homedir(), '.config', 'soda-agent-sync');
const PROFILES_DIR = path.join(ROOT, 'profiles');
const HOOK_PROFILE_FILE = path.join(ROOT, 'hook-profile');
const THROTTLE_START_MS = 60_000;   // start 事件节流窗口
const THROTTLE_EVENT_MS = 90_000;   // cmd 事件节流窗口
const THROTTLE_PING_MS = 120_000;   // ping working 节流窗口
const DEBUG = process.env.SODA_HOOK_DEBUG === '1';
const PROFILE_RE = /^[A-Za-z0-9_-]{1,40}$/;
// 本脚本绝对路径（正斜杠形式，可安全放进 settings.json 的 command；必须用
// fileURLToPath，否则路径含空格/中文时 %20 不解码——autopilot 踩过的坑）
const SELF = fileURLToPath(import.meta.url).replace(/\\/g, '/');

const dbg = (msg) => { if (DEBUG) console.error('[soda-hook] ' + msg); };

// ---------- 客户端脱敏（服务端 ingest 还有一次兜底涂改） ----------
function redact(s) {
  return String(s || '')
    .replace(/(--(?:token|key|password|secret|api-key)\s+)\S+/gi, '$1***')
    .replace(/\b(sk-|pk-|ghp_|xoxb)[A-Za-z0-9_-]+/gi, '***')
    .replace(/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|PWD)\s*[:=]\s*)\S+/gi, '$1***');
}

// ---------- profile 解析 ----------
function listProfiles() {
  try {
    return fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => PROFILE_RE.test(n));
  } catch { return []; }
}
function profileReady(name) {
  return fs.existsSync(path.join(PROFILES_DIR, name, 'config.json'))
    && fs.existsSync(path.join(PROFILES_DIR, name, 'private.pem'));
}
function resolveProfile() {
  const env = process.env.SODA_AGENT_PROFILE || '';
  if (env) return { name: env, why: '环境变量 SODA_AGENT_PROFILE' };
  try {
    const name = fs.readFileSync(HOOK_PROFILE_FILE, 'utf8').split('\n')[0].trim();
    if (name) return { name, why: 'hook-profile 文件' };
  } catch {}
  const all = listProfiles();
  if (all.length === 1) return { name: all[0], why: 'profiles/ 下唯一目录' };
  return null;
}
function loadIdentity(name) {
  try {
    const dir = path.join(PROFILES_DIR, name);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    const agentId = cfg.id || cfg.agentId;
    if (!agentId) return null;
    const key = crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'private.pem')));
    return { dir, agentId, key };
  } catch { return null; }
}

// ---------- 状态文件（节流窗口靠它；读坏按零值处理） ----------
function loadState(id) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(id.dir, 'hook-state.json'), 'utf8'));
    return {
      lastStartAt: Number(s.lastStartAt) || 0,
      lastEventAt: Number(s.lastEventAt) || 0,
      lastPingAt: Number(s.lastPingAt) || 0,
      lastTask: String(s.lastTask || ''),
      toolCount: Number(s.toolCount) || 0
    };
  } catch { return { lastStartAt: 0, lastEventAt: 0, lastPingAt: 0, lastTask: '', toolCount: 0 }; }
}
function saveState(id, s) {
  try { fs.writeFileSync(path.join(id.dir, 'hook-state.json'), JSON.stringify(s)); }
  catch (e) { dbg('hook-state 写入失败：' + e.message); }
}

// ---------- current_task（autopilot 靠它判断 working/idle；原子写） ----------
function writeTask(id, label) {
  const one = redact(String(label || '').replace(/[\r\n]+/g, ' ').trim()).slice(0, 200);
  const tmp = path.join(id.dir, 'current_task.tmp');
  try { fs.writeFileSync(tmp, one + '\n'); fs.renameSync(tmp, path.join(id.dir, 'current_task')); }
  catch (e) { dbg('current_task 写入失败：' + e.message); }
}
function readTask(id) {
  try { return fs.readFileSync(path.join(id.dir, 'current_task'), 'utf8').trim(); } catch { return ''; }
}
function clearTask(id) { try { fs.unlinkSync(path.join(id.dir, 'current_task')); } catch {} }

// ---------- 错误日志（追加，超 50 行截断保留末 50 行） ----------
function logError(id, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  dbg(line);
  try {
    const f = path.join(id.dir, 'hook-errors.log');
    fs.appendFileSync(f, line + '\n');
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    if (lines.length > 50) fs.writeFileSync(f, lines.slice(-50).join('\n') + '\n');
  } catch {}
}

// ---------- 签名 + 网络（单发，绝不重试；协议与 soda-event/soda-ping 一致） ----------
async function post(id, purpose, api, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const stamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const msg = `SODA-AGENT-SYNC-V2\n${purpose}\n${id.agentId}\n${stamp}\n${nonce}\n${digest}`;
  const sig = crypto.sign(null, Buffer.from(msg), id.key).toString('base64url');
  const res = await fetch(BASE + api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-soda-agent': id.agentId,
      'x-soda-time': stamp,
      'x-soda-nonce': nonce,
      'x-soda-signature': sig
    },
    body,
    signal: AbortSignal.timeout(8000) // 超时可能已送达（nonce 防重放），不做自动重试
  });
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 150));
  return text;
}
async function sendEvent(id, kind, task, detail) {
  try {
    await post(id, 'events', '/api/agent-events', {
      events: [{ kind, task: redact(task), detail: redact(detail), at: new Date().toISOString() }]
    });
    dbg(`event ${kind} 已上报：${task}`);
  } catch (e) { logError(id, `event ${kind} 上报失败：${e.message}`); }
}
async function sendPing(id, status, task) {
  try {
    await post(id, 'ping', '/api/agent-ping', { status, task: redact(task) });
    dbg(`ping ${status} 已上报`);
  } catch (e) { logError(id, `ping ${status} 失败：${e.message}`); }
}

// ---------- stdin ----------
function readStdin() {
  return new Promise((resolve) => {
    let done = false, buf = '';
    const finish = () => { if (!done) { done = true; resolve(buf); } };
    if (process.stdin.isTTY) return finish();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, 10_000).unref(); // stdin 挂住的兜底
  });
}

// ---------- 标签提炼 ----------
function promptLabel(prompt) {
  const first = String(prompt || '').split('\n')[0].trim();
  return first ? first.slice(0, 80) : '(新任务)';
}
function toolLabel(ev) {
  const name = String(ev.tool_name || '');
  const input = ev.tool_input && typeof ev.tool_input === 'object' && !Array.isArray(ev.tool_input) ? ev.tool_input : {};
  let brief;
  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
    brief = path.basename(String(input.file_path || input.notebook_path || ''));
  } else if (name === 'Bash') {
    brief = String(input.command || '').slice(0, 100);
  } else {
    try { brief = JSON.stringify(input).slice(0, 120); } catch { brief = ''; }
  }
  return (name + ': ' + brief).slice(0, 200);
}

// ---------- stdin 模式主流程（任何异常都不打断会话） ----------
async function hookMain() {
  const raw = await readStdin();
  if (!raw.trim()) { dbg('空输入，退出'); return; }
  let ev;
  try { ev = JSON.parse(raw); } catch { dbg('stdin 不是合法 JSON，退出'); return; }
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) { dbg('payload 不是对象，退出'); return; }
  const kind = String(ev.hook_event_name || '');
  if (!['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd'].includes(kind)) {
    dbg('忽略事件：' + (kind || '(无 hook_event_name)'));
    return;
  }
  const prof = resolveProfile();
  if (!prof) { dbg('无法确定 profile，静默退出'); return; }
  if (!PROFILE_RE.test(prof.name)) { dbg(`profile 名 ${prof.name} 不合法，静默退出`); return; }
  if (!profileReady(prof.name)) { dbg(`profile ${prof.name} 未接入（缺 config.json/private.pem），静默退出`); return; }
  const id = loadIdentity(prof.name);
  if (!id) { dbg(`profile ${prof.name} 身份加载失败，静默退出`); return; }
  dbg(`事件 ${kind}，profile=${prof.name}（来源：${prof.why}）`);
  const now = Date.now();

  if (kind === 'UserPromptSubmit') {
    const label = promptLabel(ev.prompt);
    writeTask(id, label); // 本地文件零成本，每次都写
    const st = loadState(id);
    st.lastTask = label;
    if (now - st.lastStartAt >= THROTTLE_START_MS) {
      st.lastStartAt = now;
      st.toolCount = 0; // 新任务重新累计
      saveState(id, st);
      await sendEvent(id, 'start', label, '会话新任务');
    } else {
      saveState(id, st);
      dbg(`start 节流中（距上次 ${Math.round((now - st.lastStartAt) / 1000)} 秒），跳过`);
    }
    return;
  }

  if (kind === 'PostToolUse') {
    const label = toolLabel(ev);
    writeTask(id, label); // 本地文件零成本，每次都写
    const st = loadState(id);
    st.toolCount += 1;
    st.lastTask = label;
    const fireCmd = now - st.lastEventAt >= THROTTLE_EVENT_MS;
    const firePing = now - st.lastPingAt >= THROTTLE_PING_MS;
    const count = st.toolCount;
    if (fireCmd) { st.lastEventAt = now; st.toolCount = 0; }
    if (firePing) { st.lastPingAt = now; }
    saveState(id, st); // 先落状态再发送：超时可能已送达，宁可少发不可重发
    const jobs = [];
    if (fireCmd) jobs.push(sendEvent(id, 'cmd', label, `工具调用 x${count}`));
    else dbg(`cmd 节流中（已累计 ${count} 次未上报）`);
    if (firePing) jobs.push(sendPing(id, 'working', label));
    else dbg('ping 节流中，跳过');
    if (jobs.length) await Promise.allSettled(jobs);
    return;
  }

  // Stop / SessionEnd：回合边界，不节流
  const last = readTask(id);
  clearTask(id);
  const st = loadState(id);
  st.lastTask = last;
  st.lastPingAt = now;
  saveState(id, st);
  if (last) await sendEvent(id, 'end', last, '回合结束');
  await sendPing(id, 'idle', '');
}

// ---------- CLI：install ----------
function localStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function cliInstall(args) {
  const doWrite = args.includes('--write');
  let profile = '';
  const i = args.indexOf('--profile');
  if (i >= 0 && args[i + 1]) profile = String(args[i + 1]).trim();
  if (!profile) {
    const ready = listProfiles().filter(profileReady);
    if (ready.length === 1) profile = ready[0];
    else {
      console.error('无法自动确定 profile（可用且已接入：' + (ready.join(', ') || '无') + '），请用 --profile <名字> 指定');
      process.exit(1);
    }
  }
  if (!PROFILE_RE.test(profile)) { console.error('profile 名不合法：' + profile); process.exit(1); }
  if (!profileReady(profile)) { console.error(`profile ${profile} 未接入（缺 config.json 或 private.pem）`); process.exit(1); }

  // 写 hook-profile：hook 运行时据此确定身份，settings.json 里不用内嵌环境变量
  try {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.writeFileSync(HOOK_PROFILE_FILE, profile + '\n');
    console.log(`profile：${profile}（已写入 ${HOOK_PROFILE_FILE}）`);
  } catch (e) { console.error('hook-profile 写入失败：' + e.message); process.exit(1); }

  const cmd = `node "${SELF}"`;
  const mkEntry = () => ({ hooks: [{ type: 'command', command: cmd }] });
  const snippet = { hooks: { UserPromptSubmit: [mkEntry()], PostToolUse: [mkEntry()], Stop: [mkEntry()] } };
  console.log('');
  console.log('Claude Code settings.json 的 hooks 配置片段：');
  console.log(JSON.stringify(snippet, null, 2));

  if (!doWrite) {
    console.log('');
    console.log('以上片段需合并进 ~/.claude/settings.json 的 hooks 字段。');
    console.log('确认后加 --write 写入（需先征得本人同意）');
    return;
  }

  const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
    catch (e) { console.error(`settings.json 不是合法 JSON，已中止（未做任何修改）：${e.message}`); process.exit(1); }
    const bak = settingsFile + '.soda-bak-' + localStamp();
    try { fs.copyFileSync(settingsFile, bak); console.log('已备份：' + bak); }
    catch (e) { console.error('备份失败，已中止：' + e.message); process.exit(1); }
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
  settings.hooks = settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks) ? settings.hooks : {};
  let added = 0;
  for (const k of ['UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const arr = Array.isArray(settings.hooks[k]) ? settings.hooks[k] : [];
    const exists = arr.some((e) => e && Array.isArray(e.hooks) && e.hooks.some((h) => h && h.command === cmd));
    if (!exists) { arr.push(mkEntry()); added++; }
    settings.hooks[k] = arr; // 保留已有其他 hook 配置
  }
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log(`已写入 ${settingsFile}（新增 ${added} 个钩子，重复的已跳过；下次会话生效）`);
  } catch (e) { console.error('settings.json 写入失败：' + e.message); process.exit(1); }
}

// ---------- CLI：status ----------
function cliStatus() {
  const prof = resolveProfile();
  if (!prof) { console.log('profile：未确定（hook 会静默跳过；可用：' + (listProfiles().join(', ') || '无') + '）'); return; }
  console.log(`profile：${prof.name}（来源：${prof.why}）`);
  if (!profileReady(prof.name)) { console.log('  未接入：缺 config.json 或 private.pem'); return; }
  const id = loadIdentity(prof.name);
  if (!id) { console.log('  身份加载失败（config.json 缺 agent id 或私钥不可用）'); return; }
  console.log(`agentId：${id.agentId}`);
  const st = loadState(id);
  const fmt = (t) => t ? `${new Date(t).toISOString()}（${Math.round((Date.now() - t) / 1000)} 秒前）` : '从未';
  console.log(`节流状态：上次 start ${fmt(st.lastStartAt)} | 上次 cmd ${fmt(st.lastEventAt)} | 上次 ping ${fmt(st.lastPingAt)}`);
  console.log(`待上报工具调用累计：${st.toolCount} 次`);
  console.log(`最近任务：${st.lastTask || '（无）'}`);
  console.log(`current_task：${readTask(id) || '（无）'}`);
  try {
    const lines = fs.readFileSync(path.join(id.dir, 'hook-errors.log'), 'utf8').split('\n').filter(Boolean);
    console.log(`hook-errors.log（末 ${Math.min(5, lines.length)} 行）：`);
    lines.slice(-5).forEach((l) => console.log('  ' + l));
  } catch { console.log('hook-errors.log：暂无'); }
}

// ---------- 入口 ----------
const [, , sub, ...rest] = process.argv;
try {
  if (sub === 'install') cliInstall(rest);
  else if (sub === 'status') cliStatus();
  else await hookMain(); // stdin 模式（默认）
} catch (e) {
  dbg('未捕获异常（不影响会话）：' + (e && e.message));
}
process.exit(0);
