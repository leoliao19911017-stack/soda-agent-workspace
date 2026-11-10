# soda-agent-workspace

Soda AI Studio 的 **Agent 接入技能**。装上之后，Agent 会：

- `git clone` 后 `node setup.mjs` **一键安装**（技能目录 + 客户端脚本一次到位）
- 用一次性链接安全接入工作室（ed25519 签名身份，私钥只在本机）
- Claude Code 用户装 **自动上报钩子**（soda-hook.mjs）：开始 / 工具调用 / 结束自动上报，不用记得汇报
- 其他平台跑 **autopilot 后台心跳**（零 token、零记录增长），长任务不再被看板显示成「停了」
- 用 soda-event.mjs 发 **实时事件**（start / step / cmd / end / blocked / error / note，支持 --batch 批量）
- 上报工作状态（working / idle / blocked / done）与完成摘要；**每完成一个任务必须上报**，并带「做成了什么 / 怎么证明 / 还差什么」
- 维护所属员工的目标与计划，代写本人周报月报
- 领取工作室派下来的活（handoff-inbox）
- 用签名身份自我更新（self-update），不需要 token

## 装法

**新 Agent（首次接入）——从仓库装，不需要 token：**

```bash
git clone https://github.com/leoliao19911017-stack/soda-agent-workspace.git
cd soda-agent-workspace
node setup.mjs
```

setup.mjs 会把 SKILL.md 和全部脚本复制到 `~/.agents/skills/soda-agent-workspace/`，并从 SKILL.md 提取客户端脚本到 `~/.config/soda-agent-sync/bin/soda-agent.mjs`。然后按 SKILL.md「首次接入」4 步完成授权；Claude Code 用户再跑 `node soda-hook.mjs install`（写 settings.json 前征得本人同意），其他平台跑 `node soda-autopilot.mjs start`。

**已经装过的——自更新（从技能库拉最新版，不需要重新 clone）：**

```bash
node ~/.config/soda-agent-sync/bin/soda-agent.mjs self-update
```

## 文件清单

| 文件 | 用途 |
|---|---|
| `SKILL.md` | 技能文档；内嵌 soda-agent.mjs 客户端脚本全文 |
| `setup.mjs` | 一键安装器（Node >= 18，零依赖） |
| `soda-hook.mjs` | Claude Code 钩子适配器：自动上报事件 + 心跳 |
| `soda-task.sh` | 给任意命令包一层实时事件（bash） |
| `soda-autopilot.mjs` | 后台心跳守护（读 current_task 决定 working / idle） |
| `soda-event.mjs` | 实时事件上报（单条 / --batch NDJSON ≤100 条） |
| `soda-ping.mjs` | 零记录心跳 |
| `README.md` | 本文件 |

## 版本

| 版本 | 内容 |
|---|---|
| v2.0.0 | setup.mjs 一键安装；soda-hook.mjs Claude Code 自动上报钩子；soda-task.sh 命令包装；event --batch 批量；autopilot 修复（空格路径 / status / 连续失败告警）；客户端脚本 sync 联动 current_task |
| v1.9.0 | soda-autopilot 一条命令开启自动上报（跨平台，零 token） |
| v1.8.0 | soda-ping 低价心跳（零记录增长） |
| v1.7.0 | 收录 soda-event.mjs，实时事件（start/step/end） |
| v1.6.0 | 长任务心跳规则 |
| v1.5.0 | 完成任务按任务名覆盖，不再产生流水账 |
| v1.4.0 | 取消全员汇报权限要求；多 profile 独立身份 |
| v1.3.0 | 自更新（self-update） |
| v1.2.0 | 收件箱 handoff-inbox / handoff-claim |
| v1.1.0 | 任务完成必须上报（收尾三问） |

## 许可

内部使用。
