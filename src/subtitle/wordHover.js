import { apiMicrosoftDict } from "../apis/index.js";
import { logger } from "../libs/log.js";
import { trustedTypesHelper } from "../libs/trustedTypes.js";
import {
  createFavoriteButton,
  saveFavoriteWordIfMissing,
} from "./favoriteWords.js";

/**
 * 动态向网页 document.head 中注入生词 hover 及详情气泡弹窗所需的 CSS 样式
 */
export const addWordHoverStyles = () => {
  // 如果已经注入过该样式表，直接返回，避免重复创建
  if (document.getElementById("kiss-word-hover-styles")) return;

  const style = document.createElement("style");
  style.id = "kiss-word-hover-styles";
  style.textContent = `
    /* 鼠标 hover 的单词样式：呈现下划线，指示可点击查词 */
    .kiss-word-hover {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: #4fc3f7;
      text-decoration-thickness: 2px;
    }

    /* 查词气泡弹窗主体样式 */
    .kiss-word-tooltip {
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      z-index: 2147483647;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: Arial, sans-serif;
    }

    /* 气泡弹窗头部（包含单词名和关闭按钮） */
    .kiss-word-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 16px;
      color: #4fc3f7;
    }

    /* 关闭气泡弹窗的 X 按钮 */
    .kiss-word-tooltip-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      margin-left: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kiss-word-tooltip-close:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }

    /* 释义加载中状态文案 */
    .kiss-word-loading {
      color: #bbb;
      font-style: italic;
    }

    /* 单词词性释义行 */
    .kiss-word-definition {
      margin: 4px 0;
    }

    /* 词性前缀标记（如 n. / v. 等） */
    .kiss-word-pos {
      color: #4fc3f7;
      font-weight: bold;
    }

    /* 音标字符样式 */
    .kiss-word-phonetic {
      color: #bbb;
      font-style: italic;
      margin-right: 10px;
    }

    /* 例句包裹区 */
    .kiss-word-example {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #444;
    }

    .kiss-word-example-title {
      font-weight: bold;
      margin-bottom: 5px;
    }

    /* 例句英文正文 */
    .kiss-word-example-sentence {
      margin-bottom: 3px;
    }

    /* 例句中文翻译 */
    .kiss-word-example-translation {
      color: #bbb;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
};

/**
 * 使用正则表达式，将英文字幕文本中的每一个独立英文单词（包括带单引号/撇号的如 it's）使用 span 标签包裹。
 *
 * @param {string} text - 原文字幕字符串
 * @returns {string} 替换为带 span 标签的 HTML 字符串
 */
export function wrapWordsWithSpans(text) {
  return String(text || "").replace(
    /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g,
    '<span class="kiss-subtitle-word" data-word="$1">$1</span>'
  );
}

export class WordTooltipController {
  constructor({
    getVideoContainer,
    getTimestamp,
    autoFavWord = false,
    i18n = () => "",
  }) {
    this.getVideoContainer = getVideoContainer;
    this.getTimestamp = getTimestamp;
    this.autoFavWord = autoFavWord;
    this.i18n = i18n;
    this.tooltipEl = null;
    this.hoverTimeout = null;
    this.activeWordEl = null;
    this.isInsideTooltip = false;
    this.pinned = false;
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  onDocumentPointerDown(event) {
    if (!this.tooltipEl || !this.pinned) return;
    if (
      this.tooltipEl.contains(event.target) ||
      event.target.closest?.(".kiss-subtitle-word")
    ) {
      return;
    }
    this.pinned = false;
    this.hideWordTooltip();
  }

  attachSpanListeners(root, getTimestamp = this.getTimestamp) {
    if (!root) return;

    const spans = root.querySelectorAll(".kiss-subtitle-word");
    spans.forEach((span) => {
      if (span.dataset.kissListenerAttached) return;
      const enterHandler = (event) =>
        this.#handleWordHover(event, getTimestamp);
      const leaveHandler = (event) => this.#handleWordHoverOut(event);
      const clickHandler = (event) =>
        this.#handleWordClick(event, getTimestamp);
      span.addEventListener("pointerenter", enterHandler);
      span.addEventListener("pointerleave", leaveHandler);
      span.addEventListener("click", clickHandler);
      span.dataset.kissListenerAttached = "1";
    });
  }

  #extractWordContext(target, getTimestamp) {
    const timestamp = getTimestamp?.() ?? 0;
    let contextSentence = "";
    let contextTranslation = "";

    const captionWindow = target.closest(".kiss-caption-window");
    if (captionWindow) {
      const paragraphs = captionWindow.querySelectorAll("p");
      if (paragraphs.length >= 2) {
        const targetP = target.closest("p");
        if (targetP) {
          contextSentence = targetP.textContent.trim();
          const otherP = Array.from(paragraphs).find((p) => p !== targetP);
          if (otherP) {
            contextTranslation = otherP.textContent.trim();
          }
        }
      } else if (paragraphs.length === 1) {
        contextSentence = paragraphs[0].textContent.trim();
      }
    }

    if (!contextSentence) {
      const parentP = target.closest("p") || target.parentElement;
      if (parentP) contextSentence = parentP.textContent.trim();
    }

    const sourceTitle =
      typeof document !== "undefined" && document.title
        ? document.title.replace(/\s*-\s*YouTube$/i, "").trim()
        : "";
    let sourceUrl = typeof window !== "undefined" ? window.location.href : "";
    if (timestamp > 0 && sourceUrl.includes("youtube.com/watch")) {
      try {
        const urlObj = new URL(sourceUrl);
        const seconds = Math.floor(timestamp / 1000);
        urlObj.searchParams.set("t", `${seconds}s`);
        sourceUrl = urlObj.toString();
      } catch (e) {
        // fallback
      }
    }

    return {
      timestamp,
      contextSentence,
      contextTranslation,
      sourceTitle,
      sourceUrl,
    };
  }

  #handleWordClick(event, getTimestamp) {
    const target = event.target;
    if (!target.classList.contains("kiss-subtitle-word")) return;

    event.stopPropagation();
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    target.classList.add("kiss-word-hover");
    this.activeWordEl = target;
    this.pinned = true;
    const contextData = this.#extractWordContext(target, getTimestamp);
    this.showWordTooltip(target.dataset.word, contextData);
  }

  destroy() {
    document.removeEventListener(
      "pointerdown",
      this.onDocumentPointerDown,
      true
    );
    this.clearHoverState();
  }

  clearHoverState() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.pinned = false;
    this.isInsideTooltip = false;
    this.activeWordEl?.classList.remove("kiss-word-hover");
    this.activeWordEl = null;
    this.hideWordTooltip();
  }

  #handleWordHover(event, getTimestamp) {
    const target = event.target;
    if (!target.classList.contains("kiss-subtitle-word")) return;

    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    target.classList.add("kiss-word-hover");
    this.activeWordEl = target;

    if (this.pinned) return;

    const contextData = this.#extractWordContext(target, getTimestamp);
    this.hoverTimeout = setTimeout(() => {
      this.showWordTooltip(target.dataset.word, contextData);
    }, 250);
  }

  #handleWordHoverOut(event) {
    const target = event.target;
    if (!target.classList.contains("kiss-subtitle-word")) return;

    target.classList.remove("kiss-word-hover");
    if (this.activeWordEl === target) {
      this.activeWordEl = null;
    }

    if (this.pinned) return;

    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // 预留足够时间（400ms）让鼠标从底部字幕移动到右上角释义卡片
    this.hoverTimeout = setTimeout(() => {
      if (!this.isInsideTooltip && !this.pinned) {
        this.hideWordTooltip();
      }
    }, 400);
  }

  async showWordTooltip(word, contextData = {}) {
    const {
      timestamp = 0,
      contextSentence = "",
      contextTranslation = "",
      sourceTitle = "",
      sourceUrl = "",
    } = contextData;

    if (this.tooltipEl) {
      this.tooltipEl.remove();
    }

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "kiss-word-tooltip";
    this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(
      '<div class="kiss-word-loading">Looking up...</div>'
    );

    // 监听鼠标移入/移出释义卡片，实现悬浮保持 (Keep-Alive)
    this.tooltipEl.addEventListener("pointerenter", () => {
      this.isInsideTooltip = true;
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
    });

    this.tooltipEl.addEventListener("pointerleave", () => {
      this.isInsideTooltip = false;
      if (!this.pinned) {
        this.hoverTimeout = setTimeout(() => {
          if (!this.isInsideTooltip && !this.pinned) {
            this.hideWordTooltip();
          }
        }, 300);
      }
    });

    const videoContainer = this.getVideoContainer?.();
    if (videoContainer) {
      const containerRect = videoContainer.getBoundingClientRect();
      const tooltipWidth = 300;
      const tooltipHeight = 400;

      const left = containerRect.right - tooltipWidth - 45;
      const top = containerRect.top + 20;

      const maxLeft = window.innerWidth - tooltipWidth - 10;
      this.tooltipEl.style.left = Math.min(maxLeft, Math.max(10, left)) + "px";
      this.tooltipEl.style.top = Math.max(10, top) + "px";
      this.tooltipEl.style.maxWidth = tooltipWidth + "px";
      this.tooltipEl.style.maxHeight = tooltipHeight + "px";
      this.tooltipEl.style.overflow = "auto";
    }

    document.body.appendChild(this.tooltipEl);

    try {
      const dictResult = await apiMicrosoftDict(word);
      const { phonetic, definition, examples } =
        this.#extractDictionaryData(dictResult);

      this.#dispatchAddWord({
        word,
        phonetic,
        definition,
        examples,
        contextSentence,
        contextTranslation,
        sourceTitle,
        sourceUrl,
        timestamp,
      });
      const wordData = {
        timestamp,
        phonetic,
        definition,
        examples,
        contextSentence,
        contextTranslation,
        sourceTitle,
        sourceUrl,
      };
      const hasDictionaryResult = Boolean(
        dictResult && (dictResult.trs || dictResult.aus || dictResult.sentences)
      );
      if (this.autoFavWord && hasDictionaryResult) {
        await saveFavoriteWordIfMissing(word, wordData);
      }
      this.#renderDictionaryResult(word, dictResult, wordData);
    } catch (error) {
      logger.info("Dictionary lookup failed for word:", word, error);
      this.#dispatchAddWord({
        word,
        phonetic: "",
        definition: "",
        examples: [],
        contextSentence,
        contextTranslation,
        sourceTitle,
        sourceUrl,
        timestamp,
      });

      const fallbackWordData = {
        timestamp,
        contextSentence,
        contextTranslation,
        sourceTitle,
        sourceUrl,
      };

      if (this.tooltipEl) {
        let content = `<div class="kiss-word-tooltip-header">
        <span>${word}</span>
        <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
      </div>
      <div class="kiss-word-definition">Failed to load definition</div>`;

        if (contextSentence) {
          content += `<div class="kiss-word-example kiss-word-context" style="background: rgba(79, 195, 247, 0.1); border-left: 3px solid #4fc3f7; padding: 6px 8px; border-radius: 4px; margin-top: 8px;">
            <div class="kiss-word-example-title" style="color: #4fc3f7; margin-bottom: 2px;">摘录原句</div>
            <div class="kiss-word-example-sentence" style="font-weight: 500;">${contextSentence}</div>
            ${contextTranslation ? `<div class="kiss-word-example-translation" style="color: #ccc; margin-top: 2px;">${contextTranslation}</div>` : ""}
            ${sourceTitle ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">来源: <a href="${sourceUrl || "#"}" target="_blank" style="color: #4fc3f7; text-decoration: none;">${sourceTitle}</a></div>` : ""}
          </div>`;
        }

        this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
        this.#addFavoriteButton(word, fallbackWordData);
      }
    }
  }

  hideWordTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
    this.pinned = false;
    this.isInsideTooltip = false;
  }

  #extractDictionaryData(dictResult) {
    let phonetic = "";
    if (dictResult && dictResult.aus) {
      const usPhonetic = dictResult.aus.find((au) => au.key === "美");
      if (usPhonetic && usPhonetic.phonetic) {
        phonetic = usPhonetic.phonetic;
      } else if (dictResult.aus.length > 0 && dictResult.aus[0].phonetic) {
        phonetic = dictResult.aus[0].phonetic;
      }
    }

    let definition = "";
    if (dictResult && dictResult.trs) {
      definition = dictResult.trs
        .slice(0, 3)
        .map((tr) => `${tr.pos ? tr.pos + " " : ""}${tr.def}`)
        .join("; ");
    }

    let examples = [];
    if (dictResult && dictResult.sentences) {
      examples = dictResult.sentences.slice(0, 2).map((sentence) => ({
        eng: sentence.eng,
        chs: sentence.chs,
      }));
    }

    return { phonetic, definition, examples };
  }

  #dispatchAddWord(detail) {
    document.dispatchEvent(new CustomEvent("kiss-add-word", { detail }));
  }

  #addFavoriteButton(word, data) {
    const header = this.tooltipEl?.querySelector(".kiss-word-tooltip-header");
    const closeButton = header?.querySelector(".kiss-word-tooltip-close");
    if (!header || !closeButton) return;

    header.insertBefore(
      createFavoriteButton({ word, data, i18n: this.i18n }),
      closeButton
    );
  }

  #renderDictionaryResult(word, dictResult, wordData) {
    if (
      dictResult &&
      (dictResult.trs || dictResult.aus || dictResult.sentences)
    ) {
      let content = `<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>`;

      if (dictResult.aus && dictResult.aus.length > 0) {
        content += "<div>";
        dictResult.aus.forEach((au) => {
          if (au.phonetic) {
            content += `<span class="kiss-word-phonetic">${au.phonetic}</span>`;
          }
        });
        content += "</div>";
      }

      if (dictResult.trs) {
        dictResult.trs.slice(0, 3).forEach((tr) => {
          content += `<div class="kiss-word-definition">${tr.pos ? '<span class="kiss-word-pos">' + tr.pos + "</span> " : ""}${tr.def}</div>`;
        });
      }

      // 如果有摘录原句，优先高亮展示在释义卡片上
      if (wordData?.contextSentence) {
        content += `<div class="kiss-word-example kiss-word-context" style="background: rgba(79, 195, 247, 0.1); border-left: 3px solid #4fc3f7; padding: 6px 8px; border-radius: 4px; margin-top: 8px;">
            <div class="kiss-word-example-title" style="color: #4fc3f7; margin-bottom: 2px;">摘录原句</div>
            <div class="kiss-word-example-sentence" style="font-weight: 500;">${wordData.contextSentence}</div>
            ${wordData.contextTranslation ? `<div class="kiss-word-example-translation" style="color: #ccc; margin-top: 2px;">${wordData.contextTranslation}</div>` : ""}
            ${wordData.sourceTitle ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">来源: <a href="${wordData.sourceUrl || "#"}" target="_blank" style="color: #4fc3f7; text-decoration: none;">${wordData.sourceTitle}</a></div>` : ""}
          </div>`;
      }

      if (dictResult.sentences && dictResult.sentences.length > 0) {
        content += `<div class="kiss-word-example">
            <div class="kiss-word-example-title">词典例句</div>`;
        dictResult.sentences.slice(0, 2).forEach((sentence) => {
          content += `<div class="kiss-word-example-sentence">${sentence.eng}</div>
              <div class="kiss-word-example-translation">${sentence.chs}</div>`;
        });
        content += "</div>";
      }

      if (this.tooltipEl) {
        this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
        this.#addFavoriteButton(word, wordData);
      }
      return;
    }

    if (this.tooltipEl) {
      let content = `<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>
        <div class="kiss-word-definition">No definition found</div>`;

      if (wordData?.contextSentence) {
        content += `<div class="kiss-word-example kiss-word-context" style="background: rgba(79, 195, 247, 0.1); border-left: 3px solid #4fc3f7; padding: 6px 8px; border-radius: 4px; margin-top: 8px;">
            <div class="kiss-word-example-title" style="color: #4fc3f7; margin-bottom: 2px;">摘录原句</div>
            <div class="kiss-word-example-sentence" style="font-weight: 500;">${wordData.contextSentence}</div>
            ${wordData.contextTranslation ? `<div class="kiss-word-example-translation" style="color: #ccc; margin-top: 2px;">${wordData.contextTranslation}</div>` : ""}
            ${wordData.sourceTitle ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">来源: <a href="${wordData.sourceUrl || "#"}" target="_blank" style="color: #4fc3f7; text-decoration: none;">${wordData.sourceTitle}</a></div>` : ""}
          </div>`;
      }

      this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
      this.#addFavoriteButton(word, wordData);
    }
  }
}
