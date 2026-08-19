# KISS Translator (AI 增强版)

> 基于 [KISS Translator](https://github.com/fishjar/kiss-translator) 二次开发的双语对照翻译与 YouTube 字幕优化浏览器扩展。

---

## ✨ 本版增强特性 (Enhanced Features)

- [x] **YouTube 完整整句双语翻译（彻底告别断断续续碎片字幕）**
  - **消除断续碎片**：彻底解决 YouTube 自动字幕按秒机械截断导致的“一句话被分成好几段、断断续续跳字、语义割裂”的严重痛点。
  - **语法整句重组**：通过 AI 大语言模型深度分析上下文与语法结构，严格把零散的单词流智能聚合为**语法完整、语义连贯、带规范标点的一整句**。
  - **整句地道双语对照**：每一条字幕均对应一整句完整表达，大幅提升观看英文科技评测、公开课、演讲视频时的连贯理解体验。

- [x] **生词本上下文例句与来源溯源**
  - 收藏单词时自动捕获当前网页段落或视频字幕中的**真实语境完整整句例句**与**来源网页链接**，告别脱离语境死记硬背。
  - 生词本页面支持直观浏览整句例句、音标释义与一键点击溯源回原网页。

- [x] **YouTube 字幕 AI 断句就地配置与一键改 Key**
  - 在视频字幕菜单中选择未配置的 AI 服务时，自动弹出浮层卡片一键粘贴 API Key 并立即保存启用。
  - 已配置的 AI 模型支持随时点击 `🔑 改Key` 快捷更换密钥，无需跳转繁琐的设置页。
  - 深度适配 DeepSeek 等主流大模型的标准 `max_tokens` 请求协议，支持流式按句输出与错误实时通知。

- [x] **页面悬浮球（FAB）一键直达翻译**
  - 页面悬浮球支持 **左键单击一键直接翻译** 网页英文全文（免除二次点击确认，再次单击快速还原）。
  - 支持 **鼠标右键单击** 随时唤出控制面板切换翻译服务与排版样式。

---

## 🛠️ 安装与使用

1. 下载或克隆本项目仓库：
   ```bash
   git clone https://github.com/xin30319-tech/kiss-translate-.git
   ```
2. 打开 Chrome / Edge 等基于 Chromium 的浏览器，访问扩展管理页面（`chrome://extensions` 或 `edge://extensions`）。
3. 开启页面右上角的 **开发者模式** (Developer mode)。
4. 点击 **加载已解压的扩展程序** (Load unpacked)，选择项目中的 `build/chrome` 目录即可安装启用。

---

## 📄 开源协议

本项目基于原作者 [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator) 遵循 [GPL-3.0](LICENSE) 开源协议。

