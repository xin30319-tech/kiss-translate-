import {
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
  OPT_LANGS_SPEC_DEFAULT,
} from "../config";
import { logger } from "../libs/log.js";
import { normalizeLanguageCode } from "../libs/language.js";
import { intelligentSentenceBreak } from "./sentenceBreaker.js";
import { isNonSpeechSegment } from "./subtitleTextClassification.js";

/**
 * YouTube 字幕文本处理层。
 * 只负责语言映射、timedtext 事件清洗、展平、切块和内置断句，不发起 AI 请求，也不触碰页面 DOM。
 */

/**
 * 将 YouTube 字幕语言编码映射为项目翻译 API 使用的源语言编码。
 *
 * @param {string} lang YouTube timedtext 语言编码。
 * @returns {string} 项目内部识别的语言编码，无法识别时返回 auto。
 */
export function getFromLang(lang) {
  const normalizedLang = normalizeLanguageCode(lang);
  if (normalizedLang) return normalizedLang;

  return (
    OPT_LANGS_SPEC_DEFAULT.get(lang) ||
    OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
    "auto"
  );
}

/**
 * 清洗 YouTube timedtext 字幕片段中的 HTML 标签、零宽污染和多余空白。
 *
 * @param {string} [utf8=""] 原始 utf8 字幕片段文本。
 * @returns {string} 可展示和断句的纯文本。
 */
export function cleanTimedText(utf8 = "") {
  return (
    String(utf8)
      .replace(/<[^>]+>/g, "")
      // 当前异常 timedtext 中实际污染字幕的是 U+200B 零宽空格。
      // 这里只移除 U+200B，避免误删 U+200C/U+200D 等对部分语言文字成形有意义的字符。
      .replace(/\u200B/g, "")
      .trim()
      .replace(/\s+/g, " ")
  );
}

/**
 * 一次完成 YouTube json3 events 的文本清洗、相邻重复事件去除和时间轴展平。
 * 原始输入不会被修改；统计断句读取 events，规则和 AI 断句读取已过滤非语音片段的 flatEvents。
 *
 * @param {Array<object>} [rawEvents=[]] YouTube 原始 json3 events。
 * @returns {{events:Array<object>, flatEvents:Array<object>, filteredNonSpeechCount:number}}
 */
export function prepareTimedTextEvents(rawEvents = []) {
  const events = [];
  const flatEvents = [];
  let filteredNonSpeechCount = 0;
  let buffer = null;
  let lastVisibleEventKey = "";

  const flushBuffer = (endAt) => {
    if (!buffer) return;
    if (!buffer.end || (Number.isFinite(endAt) && buffer.end > endAt)) {
      buffer.end = endAt;
    }
    if (Number.isFinite(buffer.end) && buffer.end > buffer.start) {
      flatEvents.push(buffer);
    }
    buffer = null;
  };

  for (const rawEvent of Array.isArray(rawEvents) ? rawEvents : []) {
    const event = rawEvent || {};
    const rawSegs = Array.isArray(event.segs) ? event.segs : [];
    const tStartMs = Number(event.tStartMs) || 0;
    const dDurationMs = Number(event.dDurationMs) || 0;
    const isLineBreak =
      event.aAppend === 1 && rawSegs.length === 1 && rawSegs[0]?.utf8 === "\n";
    const expandedSegs = [];
    for (let index = 0; index < rawSegs.length; index += 1) {
      const rawSeg = rawSegs[index];
      const cleaned = cleanTimedText(rawSeg?.utf8);
      if (isLineBreak) {
        expandedSegs.push({ ...rawSeg, utf8: "\n" });
        continue;
      }
      if (!cleaned) {
        expandedSegs.push({ ...rawSeg, utf8: "" });
        continue;
      }
      const tOffsetMs = Number(rawSeg?.tOffsetMs) || 0;
      const nextOffset =
        index + 1 < rawSegs.length
          ? Number(rawSegs[index + 1]?.tOffsetMs) || dDurationMs
          : dDurationMs;
      const segDuration = Math.max(0, nextOffset - tOffsetMs);

      // 如果单段包含多个单词（如人工精校字幕按屏幕宽度换行），拆分为单词级事件并按字符比例分配时间
      const words = cleaned.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const totalChars = words.reduce((acc, w) => acc + w.length, 0) || 1;
        let currentOffset = tOffsetMs;
        for (let wIdx = 0; wIdx < words.length; wIdx++) {
          const word = words[wIdx];
          const wordDuration = Math.round(
            (word.length / totalChars) * segDuration
          );
          expandedSegs.push({
            ...rawSeg,
            utf8: word,
            tOffsetMs: currentOffset,
          });
          currentOffset += wordDuration;
        }
      } else {
        expandedSegs.push({
          ...rawSeg,
          utf8: cleaned,
          tOffsetMs,
        });
      }
    }

    const normalizedSegs = expandedSegs;
    const visibleText = normalizedSegs
      .map((seg) => cleanTimedText(seg.utf8))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const eventKey = visibleText
      ? `${tStartMs}|${dDurationMs}|${visibleText}`
      : "";

    // 只删除相邻且时间、时长、可见文本完全相同的重复事件。
    if (eventKey && eventKey === lastVisibleEventKey) continue;

    const canonicalEvent = { ...event, segs: normalizedSegs };
    events.push(canonicalEvent);
    lastVisibleEventKey = eventKey;

    for (let index = 0; index < normalizedSegs.length; index += 1) {
      const { utf8 = "", tOffsetMs = 0 } = normalizedSegs[index];
      const text = cleanTimedText(utf8);
      const start = tStartMs + (Number(tOffsetMs) || 0);

      if (!text) {
        // json3 换行控制偶尔比前一事件的末尾词更早；这种倒退断点不能截掉未来词。
        if (!buffer || start > buffer.start) flushBuffer(start);
        continue;
      }

      if (isNonSpeechSegment(text)) {
        // 在声音说明开始处结束前一个语音片段，保留真实静音间隔供后续断句判断。
        flushBuffer(start);
        filteredNonSpeechCount += 1;
        continue;
      }

      flushBuffer(start);
      buffer = { text, start };
      if (index === normalizedSegs.length - 1) {
        buffer.end = tStartMs + dDurationMs;
      }
    }
  }

  flushBuffer(buffer?.end);

  return {
    events,
    flatEvents: flatEvents.filter(
      (item) =>
        item &&
        Number.isFinite(item.start) &&
        Number.isFinite(item.end) &&
        item.end > item.start
    ),
    filteredNonSpeechCount,
  };
}

/**
 * 判断字幕行是否存在过多异常长行。
 * 长行占比过高时，视为源字幕排版质量较差，应停止自动合并分段。
 *
 * @param {Array<object>} lines 待检测的字幕行数组。
 * @param {number} [lengthThreshold=200] 判定为长行的字符数阈值。
 * @param {number} [percentageThreshold=0.1] 长行占比阈值。
 * @returns {boolean} 字幕质量较差时返回 true。
 */
export function isQualityPoor(
  lines,
  lengthThreshold = 200,
  percentageThreshold = 0.1
) {
  if (lines.length === 0) return false;
  const longLinesCount = lines.filter(
    (line) => line.text.length > lengthThreshold
  ).length;
  logger.debug("Youtube Provider: quality check", {
    longLinesCount,
    totalLines: lines.length,
    percentage: longLinesCount / lines.length,
  });
  return longLinesCount / lines.length > percentageThreshold;
}

/**
 * 核心断句分行状态机算法，主要用于英文和欧系空格分隔语系。
 *
 * @param {object} [param0={}] 参数对象。
 * @param {Array<object>} param0.flatEvents 展平后的字幕事件流。
 * @param {boolean} [param0.usePause=false] 是否启用弱暂停和逻辑连词辅助断行。
 * @param {number} [param0.timeout=1000] 单词间静音间隔断行阈值，单位毫秒。
 * @param {number} [param0.maxWords=15] 单行最大单词数。
 * @param {number} [param0.maxDurationMs=10000] 单行最大持续时间，单位毫秒。
 * @returns {Array<object>} 分行后的字幕条目。
 */
export function processSubtitles({
  flatEvents,
  timeout = 2000,
  maxWords = 60,
  maxDurationMs = 30000,
} = {}) {
  const sentences = [];
  let currentBuffer = [];
  let bufferWordCount = 0;

  const flushBuffer = () => {
    if (currentBuffer.length > 0) {
      sentences.push({
        text: currentBuffer
          .map((s) => s.text)
          .join(" ")
          .trim(),
        start: currentBuffer[0].start,
        end: currentBuffer[currentBuffer.length - 1].end,
      });
    }
    currentBuffer = [];
    bufferWordCount = 0;
  };

  flatEvents.forEach((segment) => {
    if (!segment.text) return;

    const lastSegment = currentBuffer[currentBuffer.length - 1];

    if (lastSegment) {
      const isEndOfSentence = /[.?!…\])]$/.test(lastSegment.text);
      const isTimeout = segment.start - lastSegment.end > timeout;
      const isDurationExceeded =
        segment.start - currentBuffer[0].start >= maxDurationMs;
      const isWordLimitExceeded = bufferWordCount >= maxWords;
      const startsWithSign = /^[[(♪]/.test(segment.text);

      if (
        isEndOfSentence ||
        isTimeout ||
        isDurationExceeded ||
        isWordLimitExceeded ||
        startsWithSign
      ) {
        flushBuffer();
      }
    }

    currentBuffer.push(segment);
    bufferWordCount += segment.text.split(/\s+/).length;
  });

  flushBuffer();

  return sentences;
}

/**
 * 基础字幕格式化处理函数，支持按语言特性自适应分段。
 *
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {string} lang 字幕源语言代码。
 * @returns {Array<object>} 格式化后的字幕条目。
 */
export function formatSubtitles(flatEvents, lang) {
  if (!flatEvents?.length) return [];

  const noSpaceLanguages = ["zh", "ja", "ko", "th", "lo", "km", "my"];

  if (noSpaceLanguages.some((l) => lang?.startsWith(l))) {
    const subtitles = [];

    if (isQualityPoor(flatEvents, 5, 0.5)) {
      return flatEvents;
    }

    let currentLine = null;
    const MAX_LENGTH = 50;
    const PAUSE_THRESHOLD_MS = 1000;

    for (const segment of flatEvents) {
      if (segment.text) {
        // 无标点字幕遇到明显静音时先结束上一句，避免跨越长停顿合并。
        if (
          currentLine &&
          segment.start - currentLine.end > PAUSE_THRESHOLD_MS
        ) {
          subtitles.push(currentLine);
          currentLine = null;
        }

        if (!currentLine) {
          currentLine = {
            text: segment.text,
            start: segment.start,
            end: segment.end,
          };
        } else {
          currentLine.text += segment.text;
          currentLine.end = segment.end;
        }

        // 中文和日文句末可能带引号或括号，仍应在当前时间事件处立即落句。
        const isEndOfSentence = /[。！？.!?…][”’"'」』】）》）\]]*$/.test(
          segment.text
        );
        if (isEndOfSentence || currentLine.text.length >= MAX_LENGTH) {
          subtitles.push(currentLine);
          currentLine = null;
        }
      } else if (currentLine) {
        subtitles.push(currentLine);
        currentLine = null;
      }
    }

    if (currentLine) {
      subtitles.push(currentLine);
    }

    return subtitles;
  }

  return processSubtitles({ flatEvents });
}

/**
 * 基于启发式统计算法提取字幕分句。
 *
 * @param {Array<object>} events 清洗后的 YouTube json3 events。
 * @returns {Array<object>|null} 统计算法生成的字幕条目，异常时返回 null。
 */
export function algorithmicSegment(events) {
  try {
    const algorithmicSubtitles = intelligentSentenceBreak({ events });
    return algorithmicSubtitles.map((sub) => ({
      text: sub.text,
      start: sub.start,
      end: sub.end,
      translation: "",
    }));
  } catch (error) {
    logger.info("Youtube Provider: Error in algorithmic segmentation", error);
    return null;
  }
}

/**
 * 内置兜底断句方法。
 * 根据配置选择统计断句或内置规则断句。
 *
 * @param {Array<object>} events 清洗后的 YouTube json3 events。
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {string} fromLang 字幕源语言代码。
 * @param {object} [setting={}] 字幕处理配置。
 * @returns {Array<object>} 格式化后的字幕条目。
 */
export function builtinSegment(events, flatEvents, fromLang, setting = {}) {
  return runBuiltinSegmentation({
    events,
    flatEvents,
    fromLang,
    mode: setting.useAlgorithmBreaker,
    longSentenceThreshold: setting.longSentenceThreshold,
  });
}

/**
 * 统一运行规则或统计算法，并始终返回标准 SubtitleCue 结构。
 */
export function runBuiltinSegmentation({
  events = [],
  flatEvents = [],
  fromLang = "auto",
  mode = "rule",
  longSentenceThreshold = 120,
} = {}) {
  const toCues = (items) =>
    (items || []).map((item) => ({
      start: item.start,
      end: item.end,
      text: item.text,
      translation: item.translation || "",
    }));

  if (mode === "statistical") {
    logger.info("Youtube Provider: Sentence break mode: STATISTICAL");
    const result = algorithmicSegment(events);
    if (result?.length) return toCues(result);
    logger.info(
      "Youtube Provider: Statistical segmentation returned empty, falling back to rule"
    );
  }

  logger.info("Youtube Provider: Sentence break mode: RULE");
  return toCues(
    formatSubtitles(flatEvents, fromLang, { longSentenceThreshold })
  );
}

/**
 * 将展平字幕流按文本长度切分为适合 AI 分批处理的块。
 *
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {number} [chunkLength=1000] 目标分块字符数。
 * @returns {Array<Array<object>>} 字幕事件分块。
 */
export function splitEventsIntoChunks(flatEvents, chunkLength = 1000) {
  if (!flatEvents || flatEvents.length === 0) {
    return [];
  }

  const eventChunks = [];
  let currentChunk = [];
  let currentChunkTextLength = 0;
  const maxChunkLength = Math.max(1, Number(chunkLength) || 1000);
  const preferredBoundaryLength = Math.floor(maxChunkLength * 0.8);
  const PAUSE_THRESHOLD_MS = 1000;

  const flushChunk = () => {
    if (!currentChunk.length) return;
    eventChunks.push(currentChunk);
    currentChunk = [];
    currentChunkTextLength = 0;
  };

  for (let i = 0; i < flatEvents.length; i++) {
    const event = flatEvents[i];
    const eventLength = String(event?.text || "").length;

    if (
      currentChunk.length &&
      currentChunkTextLength + eventLength > maxChunkLength
    ) {
      flushChunk();
    }

    currentChunk.push(event);
    currentChunkTextLength += eventLength;

    const isLastEvent = i === flatEvents.length - 1;
    if (!isLastEvent && currentChunkTextLength >= preferredBoundaryLength) {
      const isEndOfSentence = /[.?!…\])]$/.test(event.text);
      const nextEvent = flatEvents[i + 1];
      const pauseDuration = nextEvent.start - event.end;
      if (isEndOfSentence || pauseDuration > PAUSE_THRESHOLD_MS) {
        flushChunk();
      }
    }
  }

  flushChunk();

  return eventChunks;
}
