#!/usr/bin/env node
/**
 * soda-autopilot —— 一次安装，自动上报。跨平台（Node 即可，不需要 bash）。
 *
 *   SODA_AGENT_PROFILE=xxx node soda-autopilot.mjs start [间隔秒]   默认 300
 *   SODA_AGENT_PROFILE=xxx node soda-autopilot.mjs status
 *   SODA_AGENT_PROFILE=xxx node soda-autopilot.mjs stop
 *
 * 成本：每 N 秒一次 ~200 字节请求 + 服务端一次 UPDATE，零记录增长、零 LLM 调用。
 * 延迟：心跳 ≤ N 秒；任务事件在命令开始/结束的瞬间发出（用 soda-task）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROFILE = process.env.SODA_AGENT_PROFILE || '';
if (!PROFILE) { console.error('缺少 SODA_AGENT_PROFILE'); process.exit(1); }

// 注意：必须用 fileURLToPath，直接取 URL.pathname 在路径含空格（%20）或中文时不会解码，直接崩
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PING = path.join(HERE, 'soda-ping.mjs');
const EVENT = path.join(HERE, 'soda-event.mjs');
const DIR = path.join(os.homedir(), '.config', 'soda-agent-sync', 'profiles', PROFILE);
const PID = path.join(DIR, 'autopilot.pid');
const LOG = path.join(DIR, 'autopilot.log');
const CUR = path.join(DIR, 'current_task');

if (!fs.existsSync(PING)) { console.error('找不到 soda-ping.mjs（本脚本要放在技能目录里）'); process.exit(1); }
if (!fs.existsSync(path.join(DIR, 'config.json'))) { console.error(`profile ${PROFILE} 还没接入`); process.exit(1); }

const alive = () => {
  try {
    const pid = Number(fs.readFileSync(PID, 'utf8').trim());
    process.kill(pid, 0);
    return pid;
  } catch { return 0; }
};

const cmd = process.argv[2] || 'start';

if (cmd === 'start') {
  const running = alive();
  if (running) { console.log('已在运行（PID ' + running + '）'); process.exit(0); }
  let interval = Number(process.argv[3] || 300);
  if (!Number.isFinite(interval) || interval < 30) interval = Math.max(30, interval || 300);

  // 后台循环：自己 detach，父进程立刻返回
  const child = spawn(process.execPath, [process.argv[1], '__loop', String(interval)], {
    detached: true, stdio: 'ignore', env: process.env
  });
  child.unref();
  fs.writeFileSync(PID, String(child.pid));
  console.log(`已启动：每 ${interval} 秒一次心跳（PID ${child.pid}）`);
  console.log('日志：' + LOG);
  console.log('停止：node soda-autopilot.mjs stop');
  console.log('');
  console.log('任务留痕（可选，命令开始/结束的瞬间手动上报事件）：');
  console.log(`  SODA_AGENT_PROFILE=${PROFILE} ./soda-event.mjs start "任务名" "开始执行"`);
  process.exit(0);
}

if (cmd === '__loop') {
  const interval = Number(process.argv[3] || 300);
  const log = (s) => { try { fs.appendFileSync(LOG, s + '\n'); } catch {} };
  log(`[${new Date().toISOString()}] autopilot started, interval=${interval}s`);
  // 连续失败告警：ping 连续 >=5 次失败时用同目录 soda-event.mjs 发一条 error 事件，
  // 30 分钟内最多告警一次。只记内存变量，守护进程重启自然复位，不落状态文件。
  let failStreak = 0;
  let lastAlertAt = 0;
  const ALERT_FAILS = 5;
  const ALERT_EVERY_MS = 30 * 60 * 1000;
  const beat = () => {
    let task = '';
    try { task = fs.readFileSync(CUR, 'utf8').trim(); } catch {}
    const args = [PING, task ? 'working' : 'idle', task];
    const p = spawn(process.execPath, args, { env: process.env, stdio: 'ignore' });
    p.on('exit', (code) => {
      log(`[${new Date().toISOString()}] ping exit=${code} task=${task || '-'}`);
      if (code === 0) { failStreak = 0; return; }
      failStreak++;
      if (failStreak < ALERT_FAILS || Date.now() - lastAlertAt < ALERT_EVERY_MS) return;
      lastAlertAt = Date.now();
      const detail = `心跳连续 ${failStreak} 次失败`;
      log(`[${new Date().toISOString()}] alert: ${detail}`);
      if (fs.existsSync(EVENT)) {
        spawn(process.execPath, [EVENT, 'error', 'autopilot', detail], { env: process.env, stdio: 'ignore' });
      }
    });
  };
  beat();
  setInterval(beat, interval * 1000);
  // 保持进程存活
  process.stdin.resume();
}

else if (cmd === 'stop') {
  const pid = alive();
  if (!pid) { console.log('没有在运行'); process.exit(0); }
  try { process.kill(pid); } catch {}
  try { fs.unlinkSync(PID); } catch {}
  console.log('已停止（PID ' + pid + '）');
  process.exit(0);
}

else if (cmd === 'status') {
  const pid = alive();
  console.log(`profile：${PROFILE}`);
  let interval = '';
  try {
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/interval=(\d+)s/);
      if (m) { interval = m[1]; break; }
    }
  } catch {}
  console.log(`心跳间隔：${interval ? interval + ' 秒' : '未知（暂无启动日志）'}`);
  let task = '';
  try { task = fs.readFileSync(CUR, 'utf8').trim(); } catch {}
  console.log(`current_task：${task || '（空 → 上报 idle）'}`);
  if (!pid) { console.log('守护进程：未运行（无 PID 文件或进程已退出）'); process.exit(0); }
  console.log(`守护进程：运行中（PID ${pid}）`);
  try {
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(-5);
    console.log('最近心跳：');
    lines.forEach(l => console.log('  ' + l));
  } catch { console.log('  暂无日志'); }
  process.exit(0);
}

else { console.log('用法：soda-autopilot.mjs {start [间隔秒]|stop|status}'); process.exit(1); }
