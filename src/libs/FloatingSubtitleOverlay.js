import browser from "webextension-polyfill";
import {
  MSG_SUBTITLE_BROADCAST,
  MSG_SUBTITLE_CONTROL,
  MSG_GET_SUBTITLE_STATE,
} from "../config/msg";
import { logger } from "./log";
import { sendBgMsg } from "./msg";

const STORAGE_KEY_POS = "kiss_floating_sub_pos";
const STORAGE_KEY_SCALE = "kiss_floating_sub_scale";

/**
 * 跨页面实时双语字幕悬浮窗
 * 当 YouTube 在后台播放视频时，在当前浏览页面显示半透明、可拖拽、可控制播放的置顶双语字幕卡片
 */
export class FloatingSubtitleOverlay {
  #hostEl = null;
  #shadowRoot = null;
  #cardEl = null;
  #originEl = null;
  #transEl = null;
  #playPauseBtn = null;
  #titleEl = null;
  #scale = 1.0;
  #isDragging = false;
  #isDismissed = false;
  #lastVideoTitle = "";
  #broadcastChannel = null;
  #latestState = null;
  #hideTimer = null;
  #pollTimer = null;
  #renderedText = "";
  #renderedTrans = "";
  #renderedIsPlaying = null;
  #renderedTitle = "";

  constructor() {
    this.#loadSettings();
    this.#initBroadcastChannel();
    this.#initMessageListener();
    this.#initStorageListener();
    this.#initVisibilityListener();
    this.#initPolling();
    this.#createDom();
    this.#fetchCurrentSubtitleState();
  }

  #initStorageListener() {
    const onStorageChange = (changes, areaName) => {
      if (
        (areaName === "local" || !areaName) &&
        changes?.kiss_latest_subtitle?.newValue
      ) {
        this.handleSubtitleUpdate(changes.kiss_latest_subtitle.newValue);
      }
    };

    try {
      if (typeof browser !== "undefined" && browser?.storage?.onChanged) {
        browser.storage.onChanged.addListener(onStorageChange);
      } else if (
        typeof globalThis.chrome !== "undefined" &&
        globalThis.chrome?.storage?.onChanged
      ) {
        globalThis.chrome.storage.onChanged.addListener(onStorageChange);
      }
    } catch {}
  }

  #loadSettings() {
    try {
      const savedScale = localStorage.getItem(STORAGE_KEY_SCALE);
      if (savedScale) {
        this.#scale = Math.min(
          Math.max(parseFloat(savedScale) || 1.0, 0.7),
          2.0
        );
      }
    } catch {
      this.#scale = 1.0;
    }
  }

  #savePosition(left, top) {
    try {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ left, top }));
    } catch {
      // ignore
    }
  }

  #getPosition() {
    try {
      const pos = JSON.parse(localStorage.getItem(STORAGE_KEY_POS) || "null");
      if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
        return pos;
      }
    } catch {
      // ignore
    }
    return null;
  }

  #saveScale(scale) {
    this.#scale = scale;
    try {
      localStorage.setItem(STORAGE_KEY_SCALE, scale.toString());
    } catch {
      // ignore
    }
    this.#applyScale();
  }

  #applyScale() {
    if (!this.#cardEl) return;
    if (this.#originEl) {
      this.#originEl.style.fontSize = `${Math.round(13 * this.#scale)}px`;
    }
    if (this.#transEl) {
      this.#transEl.style.fontSize = `${Math.round(16 * this.#scale)}px`;
    }
  }

  #initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.#broadcastChannel = new BroadcastChannel("kiss_subtitle_sync");
        this.#broadcastChannel.onmessage = (e) => {
          if (e.data) {
            this.handleSubtitleUpdate(e.data);
          }
        };
      }
    } catch (e) {
      logger.debug("BroadcastChannel not supported", e);
    }
  }

  #initMessageListener() {
    const runtime =
      (typeof browser !== "undefined" && browser?.runtime) ||
      (typeof globalThis.chrome !== "undefined" &&
        globalThis.chrome?.runtime) ||
      null;

    if (runtime?.onMessage) {
      runtime.onMessage.addListener((message) => {
        if (message?.action === MSG_SUBTITLE_BROADCAST && message?.args) {
          this.handleSubtitleUpdate(message.args);
        }
      });
    }
  }

  #initPolling() {
    if (this.#pollTimer) clearInterval(this.#pollTimer);
    this.#pollTimer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !window.location.hostname.includes("youtube.com")
      ) {
        this.#fetchCurrentSubtitleState();
      }
    }, 1000);
  }

  async #fetchCurrentSubtitleState() {
    try {
      let state = null;
      if (typeof browser !== "undefined" && browser?.storage?.local) {
        const res = await browser.storage.local.get("kiss_latest_subtitle");
        state = res?.kiss_latest_subtitle;
      } else if (
        typeof globalThis.chrome !== "undefined" &&
        globalThis.chrome?.storage?.local
      ) {
        state = await new Promise((resolve) => {
          globalThis.chrome.storage.local.get("kiss_latest_subtitle", (res) => {
            resolve(res?.kiss_latest_subtitle);
          });
        });
      }
      if (!state) {
        state = await sendBgMsg(MSG_GET_SUBTITLE_STATE);
      }
      if (state && (state.isPlaying || state.text || state.translation)) {
        this.handleSubtitleUpdate(state);
      }
    } catch {}
  }

  #initVisibilityListener() {
    const handleActive = () => {
      // 如果当前是在 YouTube 页面且切回前台，隐藏本悬浮窗（由播放器自带字幕负责）
      if (
        document.visibilityState === "visible" &&
        window.location.hostname.includes("youtube.com")
      ) {
        this.hide();
      } else if (document.visibilityState === "visible") {
        this.#fetchCurrentSubtitleState();
      }
    };

    document.addEventListener("visibilitychange", handleActive);
    window.addEventListener("focus", handleActive);
  }

  #createDom() {
    if (this.#hostEl) return;

    this.#hostEl = document.createElement("div");
    this.#hostEl.id = "kiss-floating-subtitle-root";
    this.#hostEl.setAttribute("notranslate", "yes");
    this.#hostEl.style.cssText =
      "all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; border: none !important; overflow: visible !important; display: block !important;";

    this.#shadowRoot = this.#hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .kiss-float-card {
        box-sizing: border-box !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        position: fixed !important;
        min-width: 360px !important;
        max-width: 800px !important;
        background: #0f172a !important;
        background: rgba(15, 23, 42, 0.96) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        border: 1px solid rgba(255, 255, 255, 0.22) !important;
        border-radius: 16px !important;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
        padding: 12px 20px 16px 20px !important;
        color: #f8fafc !important;
        pointer-events: auto !important;
        cursor: default !important;
        z-index: 2147483647 !important;
        display: none;
        margin: 0 !important;
        line-height: normal !important;
      }
      .kiss-float-card.visible {
        display: block !important;
      }
      .kiss-float-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 12px;
        color: #94a3b8;
        user-select: none;
      }
      .kiss-float-left {
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 55%;
        cursor: pointer;
        transition: color 0.15s;
      }
      .kiss-float-left:hover {
        color: #38bdf8;
      }
      .kiss-float-badge {
        background: #ef4444;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 6px;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      .kiss-float-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }
      .kiss-float-drag-handle {
        cursor: grab;
        padding: 2px 6px;
        border-radius: 4px;
        color: #64748b;
        transition: background 0.15s, color 0.15s;
        display: flex;
        align-items: center;
      }
      .kiss-float-drag-handle:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
      }
      .kiss-float-drag-handle:active {
        cursor: grabbing;
      }
      .kiss-float-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .kiss-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        padding: 3px 7px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        line-height: 1;
      }
      .kiss-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.3);
      }
      .kiss-btn:active {
        transform: scale(0.95);
      }
      .kiss-btn-close {
        color: #94a3b8;
        font-weight: bold;
        font-size: 14px;
        padding: 3px 6px;
      }
      .kiss-btn-close:hover {
        background: rgba(239, 68, 68, 0.3);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.4);
      }
      .kiss-float-body {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
        word-break: break-word;
      }
      .kiss-float-origin {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.45;
        margin: 0;
        opacity: 0.9;
      }
      .kiss-float-trans {
        color: #38bdf8;
        font-weight: 600;
        font-size: 16px;
        line-height: 1.45;
        margin: 0;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
      }
    `;
    this.#shadowRoot.appendChild(style);

    this.#cardEl = document.createElement("div");
    this.#cardEl.className = "kiss-float-card";

    // 工具栏
    const toolbar = document.createElement("div");
    toolbar.className = "kiss-float-toolbar";

    // 视频标题（点击跳回 YouTube）
    const titleCont = document.createElement("div");
    titleCont.className = "kiss-float-left";
    titleCont.title = "点击直接切回 YouTube 视频标签页";

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "kiss-float-badge";
    badgeSpan.textContent = "YT";

    this.#titleEl = document.createElement("span");
    this.#titleEl.className = "kiss-float-title";
    this.#titleEl.textContent = "YouTube 视频播放中";

    titleCont.appendChild(badgeSpan);
    titleCont.appendChild(this.#titleEl);
    titleCont.addEventListener("click", () => {
      this.#sendControl({ action: "jump_to_tab" });
    });

    // 拖拽把手
    const dragHandle = document.createElement("div");
    dragHandle.className = "kiss-float-drag-handle";
    dragHandle.title = "按住拖拽移动悬浮字幕位置";
    dragHandle.textContent = "⠿";

    // 按钮动作区
    const actions = document.createElement("div");
    actions.className = "kiss-float-actions";

    // 播放/暂停
    this.#playPauseBtn = document.createElement("button");
    this.#playPauseBtn.className = "kiss-btn";
    this.#playPauseBtn.title = "暂停 / 播放视频";
    this.#playPauseBtn.textContent = "⏸";
    this.#playPauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#sendControl({ action: "toggle_play" });
    });

    // 快退 5秒
    const seekBackBtn = document.createElement("button");
    seekBackBtn.className = "kiss-btn";
    seekBackBtn.title = "后退 5 秒";
    seekBackBtn.textContent = "⏪";
    seekBackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#sendControl({ action: "seek", delta: -5 });
    });

    // 快进 5秒
    const seekForwardBtn = document.createElement("button");
    seekForwardBtn.className = "kiss-btn";
    seekForwardBtn.title = "快进 5 秒";
    seekForwardBtn.textContent = "⏩";
    seekForwardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#sendControl({ action: "seek", delta: 5 });
    });

    // 缩小字体
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.className = "kiss-btn";
    zoomOutBtn.title = "缩小字幕字体";
    zoomOutBtn.textContent = "A-";
    zoomOutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#saveScale(Math.max(0.7, this.#scale - 0.1));
    });

    // 放大字体
    const zoomInBtn = document.createElement("button");
    zoomInBtn.className = "kiss-btn";
    zoomInBtn.title = "放大字幕字体";
    zoomInBtn.textContent = "A+";
    zoomInBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#saveScale(Math.min(2.0, this.#scale + 0.1));
    });

    // 关闭/最小化
    const closeBtn = document.createElement("button");
    closeBtn.className = "kiss-btn kiss-btn-close";
    closeBtn.title = "关闭悬浮字幕";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#isDismissed = true;
      this.hide();
    });

    actions.appendChild(seekBackBtn);
    actions.appendChild(this.#playPauseBtn);
    actions.appendChild(seekForwardBtn);
    actions.appendChild(zoomOutBtn);
    actions.appendChild(zoomInBtn);
    actions.appendChild(closeBtn);

    toolbar.appendChild(titleCont);
    toolbar.appendChild(dragHandle);
    toolbar.appendChild(actions);

    // 字幕内容区
    const body = document.createElement("div");
    body.className = "kiss-float-body";

    this.#originEl = document.createElement("p");
    this.#originEl.className = "kiss-float-origin";

    this.#transEl = document.createElement("p");
    this.#transEl.className = "kiss-float-trans";

    body.appendChild(this.#originEl);
    body.appendChild(this.#transEl);

    this.#cardEl.appendChild(toolbar);
    this.#cardEl.appendChild(body);
    this.#shadowRoot.appendChild(this.#cardEl);

    this.#ensureMounted();

    this.#applyScale();
    this.#restorePosition();
    this.#enableDragging(dragHandle, toolbar);
  }

  #ensureMounted() {
    const target = document.body || document.documentElement;
    if (this.#hostEl && target && this.#hostEl.parentNode !== target) {
      target.appendChild(this.#hostEl);
    }
  }

  #restorePosition() {
    const saved = this.#getPosition();
    if (saved && this.#cardEl) {
      const maxLeft = Math.max(
        0,
        window.innerWidth - (this.#cardEl.offsetWidth || 400)
      );
      const maxTop = Math.max(
        0,
        window.innerHeight - (this.#cardEl.offsetHeight || 120)
      );
      const left = Math.min(Math.max(10, saved.left), maxLeft);
      const top = Math.min(Math.max(10, saved.top), maxTop);
      this.#cardEl.style.left = `${left}px`;
      this.#cardEl.style.top = `${top}px`;
      this.#cardEl.style.bottom = "auto";
      this.#cardEl.style.right = "auto";
    } else if (this.#cardEl) {
      // 默认居中贴近屏幕底部
      this.#cardEl.style.left = "50%";
      this.#cardEl.style.transform = "translateX(-50%)";
      this.#cardEl.style.bottom = "36px";
      this.#cardEl.style.top = "auto";
    }
  }

  #enableDragging(handleEl, toolbarEl) {
    let startX = 0,
      startY = 0;
    let initialLeft = 0,
      initialTop = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button") || e.target.closest(".kiss-float-left"))
        return;

      this.#isDragging = true;
      const rect = this.#cardEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      // 切换为 absolute 定位坐标
      this.#cardEl.style.left = `${initialLeft}px`;
      this.#cardEl.style.top = `${initialTop}px`;
      this.#cardEl.style.bottom = "auto";
      this.#cardEl.style.transform = "none";
      this.#cardEl.style.transition = "none";

      const onMouseMove = (moveEvent) => {
        if (!this.#isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const maxLeft = Math.max(
          0,
          window.innerWidth - this.#cardEl.offsetWidth
        );
        const maxTop = Math.max(
          0,
          window.innerHeight - this.#cardEl.offsetHeight
        );

        const newLeft = Math.min(Math.max(0, initialLeft + dx), maxLeft);
        const newTop = Math.min(Math.max(0, initialTop + dy), maxTop);

        this.#cardEl.style.left = `${newLeft}px`;
        this.#cardEl.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (!this.#isDragging) return;
        this.#isDragging = false;
        this.#cardEl.style.transition = "";

        const currentRect = this.#cardEl.getBoundingClientRect();
        this.#savePosition(currentRect.left, currentRect.top);

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    handleEl.addEventListener("mousedown", onMouseDown);
    toolbarEl.addEventListener("mousedown", onMouseDown);
  }

  #sendControl(controlArgs) {
    sendBgMsg(MSG_SUBTITLE_CONTROL, controlArgs).catch(() => {});
  }

  /**
   * 接收并渲染跨页面广播过来的最新字幕数据
   */
  handleSubtitleUpdate(data) {
    if (!data) return;
    this.#latestState = data;

    // 如果源视频已关闭
    if (data.closed) {
      this.hide();
      return;
    }

    // 如果视频标题变了，重置 dismissed 状态
    if (data.videoTitle && data.videoTitle !== this.#lastVideoTitle) {
      this.#lastVideoTitle = data.videoTitle;
      this.#isDismissed = false;
    }

    if (this.#isDismissed) {
      return;
    }

    // 如果当前是在 YouTube 页面且处于前台，则不显示悬浮卡片
    if (
      document.visibilityState === "visible" &&
      window.location.hostname.includes("youtube.com")
    ) {
      this.hide();
      return;
    }

    // 只要有视频正在播放 (isPlaying) 或者有字幕文本，就展示悬浮卡片
    if (!data.isPlaying && !data.text && !data.translation) {
      this.#scheduleHide(2000);
      return;
    }

    this.#createDom();
    if (!this.#cardEl) return;

    this.#ensureMounted();

    // 更新内容：有文本时更新，遇到句间短暂停顿时保持上一句，避免卡片剧烈忽闪忽现
    const newText = data.text || this.#renderedText;
    const newTrans = data.translation || data.text || this.#renderedTrans;
    const newTitle = data.videoTitle || this.#renderedTitle || "YouTube 视频";
    const newIsPlaying = !!data.isPlaying;

    if (this.#titleEl && newTitle !== this.#renderedTitle) {
      this.#titleEl.textContent = newTitle;
      this.#renderedTitle = newTitle;
    }
    if (this.#originEl && newText !== this.#renderedText) {
      this.#originEl.textContent = newText;
      this.#originEl.style.display = newText ? "block" : "none";
      this.#renderedText = newText;
    }
    const displayTrans =
      newTrans || (newIsPlaying ? "YouTube 正在播放中..." : "等待视频播放...");
    if (this.#transEl && displayTrans !== this.#renderedTrans) {
      this.#transEl.textContent = displayTrans;
      this.#renderedTrans = displayTrans;
    }
    if (this.#playPauseBtn && newIsPlaying !== this.#renderedIsPlaying) {
      this.#playPauseBtn.textContent = newIsPlaying ? "⏸" : "▶";
      this.#playPauseBtn.title = newIsPlaying ? "点击暂停视频" : "点击播放视频";
      this.#renderedIsPlaying = newIsPlaying;
    }

    this.show();

    // 如果视频已暂停，60秒后自动淡出；播放中则持续常驻显示
    if (!data.isPlaying) {
      this.#scheduleHide(60000);
    } else {
      this.#cancelHide();
    }
  }

  #scheduleHide(ms) {
    this.#cancelHide();
    this.#hideTimer = setTimeout(() => {
      this.hide();
    }, ms);
  }

  #cancelHide() {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
  }

  show() {
    if (!this.#hostEl) {
      this.#createDom();
    }
    this.#ensureMounted();
    if (this.#cardEl) {
      this.#cardEl.classList.add("visible");
      this.#cardEl.style.display = "block";
    }
  }

  hide() {
    if (this.#cardEl) {
      this.#cardEl.classList.remove("visible");
      this.#cardEl.style.display = "none";
    }
  }

  destroy() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    this.#cancelHide();
    this.#broadcastChannel?.close();
    this.#hostEl?.remove();
    this.#hostEl = null;
    this.#shadowRoot = null;
    this.#cardEl = null;
  }
}

let floatingOverlayInstance = null;

/**
 * 初始化全局跨页面字幕悬浮层
 */
export function initFloatingSubtitleOverlay() {
  if (typeof document === "undefined") return;
  if (!floatingOverlayInstance) {
    floatingOverlayInstance = new FloatingSubtitleOverlay();
  }
  return floatingOverlayInstance;
}
