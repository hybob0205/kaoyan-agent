# 考研 Agent

## Platform

Web application bundled with Capacitor for Android; the same sources serve the desktop browser and local-device browser mode.

## Users and purpose

中文考研学习者，手机和平板优先。把学习 Agent、数学二/英语二/政治/408 四科研习室和拾错复习放在同一应用内，结合本机学习与错题记录安排学习。

## Confirmed constraints

- 研习室与拾错使用 Agent 内的副本，原项目不修改。
- Android 内置页面及学习记录可独立使用；联网 AI 使用用户配置的接口。
- 模型接口支持保存多份配置和切换；模型密钥不进入学习备份。
- 支持本机备份迁移，数据不自动跨设备同步。
- 所有模块保留返回 Agent 的入口，处理系统返回、安全区和数学符号显示。

## Approved visual direction

2026-09-28 用户通过五张 UI 概念图：暖纸色、森林绿、方形学习台历、四科封面、结构化对话、环绕悬浮球与独立模型设置。用户要求其他页面同步此风格，并完整处理主题切换。

## Boundaries

移动版和电脑后端的功能范围仍以 README 为准；视觉更新不宣称新增未移植功能。界面验收使用隔离浏览器测试数据，不写入用户的实际学习记录。
