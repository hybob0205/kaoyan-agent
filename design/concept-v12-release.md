# 有研在先 v12 界面交付

日期：2026-09-29。Android 版本：1.0.11（12）。包名与原调试签名保持不变。

## 素材

- 正式图标来自用户确认的 `icon-options/B-exact-seal-preview-v4.png`。原图四字由 `compose_reference_seal.py` 提取着色，`package_approved_icon.py` 输出网页与 Android 图标；不使用生成模型重画字形。
- 台历：`frontend/public/ui-art/calendar-scene-v2.png`，内置 image_gen 生成源 `exec-348e3439-2c6a-43e3-a6c4-664997ec1a17.png`。实际倒计时、考试日期和日程由页面实时叠加。
- 山水书本背景：`frontend/public/ui-art/study-landscape.png`，内置 image_gen 生成源 `exec-79be9fe4-b925-4013-a5bc-464d06266726.png`。
- 背景提示词：Production background illustration for a Chinese study app, not a UI mockup. Landscape 3:2. Warm ivory matte paper #f4f2ea, exquisite very faint traditional Chinese ink-wash sage mountains along bottom edge, small forest-green and ivory clothbound study books with no writing at far upper right, tiny pencil alongside. 75 percent of central canvas left nearly blank for live UI text, edges softly dissolve into paper, restrained tactile watercolor printing, calm elegant study atmosphere matching warm paper and forest green mobile app. No text, no letters, no numbers, no phone, no buttons, no borders. Books subtly visible, mountain silhouette more prominent bottom left but low contrast, fine paper texture. This is a reusable background for chat, study-room, and mistake-review pages.

## 验证范围

前端构建、Android assembleDebug、包名/版本/名称及原证书指纹验证通过。页面主题与溢出检查 42 项、聊天视口检查 6 种尺寸及新消息时间持久化测试通过。使用隔离浏览器与模拟模型响应，不修改用户学习记录。原研习室与拾错项目不变。

界面参考概念图并保留现有功能布局；不把概念图中的示例学习统计当作真实数据。旧对话没有时间字段的不补造时间。实体手机相机、系统键盘及厂商手势仍需安装复核。
