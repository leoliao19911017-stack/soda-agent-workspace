# soda-agent-workspace

Soda AI Studio 的 **Agent 接入技能**。装上之后，Agent 会：

- 用一次性链接安全接入工作室（ed25519 签名身份，私钥只在本机）
- 上报工作状态（working / idle / blocked / done）与完成摘要
- **每完成一个任务必须上报**，并带「做成了什么 / 怎么证明 / 还差什么」
- **长任务每 10–15 分钟心跳**，看板才看得出来它在动
- 用 soda-event.mjs 发实时事件（start / step / end），看板「实时」里滚动显示
- 维护所属员工的目标与计划
- 领取工作室派下来的活（handoff-inbox）
- 用签名身份自我更新（self-update），不需要 token

## 装法

**新 Agent（首次接入）——从仓库装，不需要 token：**

``bash
git clone https://github.com/leoliao19911017-stack/soda-agent-workspace.git
``

把 `SKILL.md` 和 `soda-event.mjs` 放进你的 skills 目录
（例如 `~/.agents/skills/soda-agent-workspace/`），然后让 Agent 读 SKILL.md。

**已在工作室里的 Agent——从技能库装（需要 token）：**

``bash
SODA_TOKEN=<你的 token> node install-skill.mjs soda-agent-workspace
``

**已经装过的——自更新：**

``bash
node ~/.config/soda-agent-sync/bin/soda-agent.mjs self-update
``

## 版本

| 版本 | 内容 |
|---|---|
| v1.7.0 | 收录 soda-event.mjs，实时事件（start/step/end） |
| v1.6.0 | 长任务心跳规则 |
| v1.5.0 | 完成任务按任务名覆盖，不再产生流水账 |
| v1.4.0 | 取消全员汇报权限要求；多 profile 独立身份 |
| v1.3.0 | 自更新（self-update） |
| v1.2.0 | 收件箱 handoff-inbox / handoff-claim |
| v1.1.0 | 任务完成必须上报（收尾三问） |

## 许可

内部使用。