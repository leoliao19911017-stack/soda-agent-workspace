#!/usr/bin/env node
/**
 * soda-agent-workspace 一键安装器（零依赖，Node >= 18）。
 *
 *   node setup.mjs
 *
 * 做三件事：
 *   1. 把脚本所在目录（仓库根）的 SKILL.md 和全部 *.mjs / *.sh 复制到
 *      ~/.agents/skills/soda-agent-workspace/（目录自动创建，覆盖写，可重复执行）
 *   2. 从 SKILL.md 提取第一个 ```javascript 代码块——与服务端 skillBundle
 *      （web/lib/agent-sync.js）的提取正则完全一致——写入
 *      ~/.config/soda-agent-sync/bin/soda-agent.mjs
 *   3. 打印安装清单（每行：源 → 目标）和下一步指引
 *
 * 校验先行：SKILL.md 缺失或没有 javascript 代码块时直接报错退出 1，
 * 不写入任何文件，绝不写半个脚本。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // 脚本所在目录 = 仓库根
const SKILL_DIR = path.join(os.homedir(), '.agents', 'skills', 'soda-agent-workspace');
const BIN_DIR = path.join(os.homedir(), '.config', 'soda-agent-sync', 'bin');
const BIN_FILE = path.join(BIN_DIR, 'soda-agent.mjs');
const SKILL_MD = path.join(ROOT, 'SKILL.md');

const fail = (msg) => { console.error(msg); process.exit(1); };

// ---- 先校验，后动手：任何一步不满足都不写文件 ----
if (!fs.existsSync(SKILL_MD)) fail(`找不到 ${SKILL_MD}（setup.mjs 必须放在仓库根，与 SKILL.md 同目录）`);
const md = fs.readFileSync(SKILL_MD, 'utf8');
// 与服务端 web/lib/agent-sync.js 的 skillBundle 保持完全一致的匹配：第一个 ```javascript 围栏块
const fence = /```javascript\r?\n([\s\S]*?)```/.exec(md);
if (!fence) fail('SKILL.md 里没有 ```javascript 代码块，无法生成 soda-agent.mjs，安装中止（未写入任何文件）');
const scripts = fs.readdirSync(ROOT).filter((n) => /\.(mjs|sh)$/.test(n)).sort();
if (scripts.length === 0) fail(`仓库根（${ROOT}）下没有 .mjs / .sh 文件，安装中止（未写入任何文件）`);

// ---- chmod 在 Windows / 受限文件系统上会失败：静默忽略 ----
const copyTo = (src, dest) => {
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o755); } catch {}
};

fs.mkdirSync(SKILL_DIR, { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });
try { fs.chmodSync(BIN_DIR, 0o700); } catch {}

console.log('安装清单：');
for (const name of ['SKILL.md', ...scripts]) {
  const src = path.join(ROOT, name);
  const dest = path.join(SKILL_DIR, name);
  copyTo(src, dest);
  console.log(`  ${src} → ${dest}`);
}
fs.writeFileSync(BIN_FILE, fence[1]);
try { fs.chmodSync(BIN_FILE, 0o600); } catch {}
console.log(`  ${SKILL_MD} → ${BIN_FILE}（内嵌客户端脚本，取第一个 javascript 代码块）`);

console.log('');
console.log(`安装完成，共 ${scripts.length + 2} 个文件。下一步：`);
console.log('  1. 首次接入：按 SKILL.md「首次接入」4 步执行（connect-start → 把一次性链接发给本人 → connect-check → sync idle 验证）');
console.log('  2. Claude Code 用户：node soda-hook.mjs install（安装钩子）');
console.log('  3. 其他平台：SODA_AGENT_PROFILE=<profile> node soda-autopilot.mjs start（默认每 5 分钟自动心跳）');
