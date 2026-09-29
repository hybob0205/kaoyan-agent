---
name: 考研 Agent
description: 暖纸与森林绿的本机学习空间
colors:
  forest: "#173f32"
  green: "#245c43"
  paper: "#f4f2ea"
  surface: "#fffcf4"
  ink: "#183229"
  muted: "#5e6b5e"
  line: "#d8d9c9"
  night-paper: "#121e1a"
  night-surface: "#1c2c25"
  night-ink: "#edf1e8"
typography:
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Noto Sans SC, sans-serif"
    lineHeight: 1.65
  numeral:
    fontFamily: "StudyNumerals, serif"
rounded:
  field: "10px"
  surface: "14px"
spacing:
  compact: "8px"
  regular: "16px"
  comfortable: "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "#fffef6"
    rounded: "{rounded.field}"
  field:
    rounded: "{rounded.field}"
  container:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
---

# Design System: 考研 Agent

## Overview

沿用用户已通过的暖纸、森林绿与学习台历方向。纸张质感用于学习入口，题目、表单和对话保持清晰、安静、可操作。设计实现以 `frontend/public/agent-design.css` 为准。

## Colors

森林绿承担主操作与选中状态；暖纸承担页面背景，纸白承担阅读区域。夜间使用深绿背景与浅色文字，不单纯反转图片。日间、纸张、夜间、跟随系统通过同一主题控制器应用到 Agent、研习室与拾错。

## Typography

中文正文优先使用设备中文字体；台历数字使用本地 StudyNumerals。公式保留 KaTeX 渲染，宽公式在自身区域横向滚动，不撑宽页面。AI 回复是可选择的结构化文本，不作为图片呈现。

## Layout

手机布局在 760px 及以下收紧间距；360px 以下进一步缩小标题。研习室保留两列封面，拾错手机首页使用单列紧凑科目行，408 子科目按钮为两列。桌面保留更宽布局。顶部和底部为设备安全区留空间，对话输入框不遮挡消息。

## Elevation & Depth

普通内容平面呈现；悬浮菜单和对话框使用柔和阴影区分层级。通用阴影为 `0 12px 34px #173f3214`，夜间为 `0 12px 34px #0004`。

## Shapes

内容容器采用柔和圆角，输入框略紧；台历保持正方形。悬浮球和围绕它展开的操作保持圆形，不改成固定底部导航。

## Components

主按钮使用森林绿，次按钮使用主题表面色；可点击区域通常至少 44px。表单字段至少 46px，高亮聚焦轮廓。主题菜单位于顶部并支持跟随系统。模型配置集中在可关闭的设置面板，不在首页显示配置细节。

入场使用 350ms 的短距离过渡，菜单使用 180ms；系统减少动态效果时关闭这些动画。所有生成插画来源保存在 `frontend/public/ui-art/provenance.json`。

## Do's and Don'ts

- Do：新增页面使用共享语义颜色，同时验证纸张与夜间主题。
- Do：保留真实学习数据、公式渲染、返回入口和原有功能。
- Don't：把示意图里的虚构数据作为真实统计。
- Don't：让固定输入框、悬浮球或系统状态栏遮挡操作。
