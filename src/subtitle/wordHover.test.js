import { WordTooltipController } from "./wordHover.js";
import { apiMicrosoftDict } from "../apis/index.js";

jest.mock("../apis/index.js", () => ({
  apiMicrosoftDict: jest.fn(),
}));

jest.mock("../libs/log.js", () => ({
  LogLevel: {
    DEBUG: { value: 0, name: "DEBUG" },
    INFO: { value: 1, name: "INFO" },
    WARN: { value: 2, name: "WARN" },
    ERROR: { value: 3, name: "ERROR" },
    SILENT: { value: 4, name: "SILENT" },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
  kissLog: jest.fn(),
}));

describe("WordTooltipController", () => {
  let controller;
  let videoContainer;
  let subtitleContainer;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
    apiMicrosoftDict.mockReset();
    apiMicrosoftDict.mockResolvedValue({
      trs: [{ pos: "n.", def: "测试释义" }],
      aus: [{ key: "美", phonetic: "/test/" }],
    });

    videoContainer = document.createElement("div");
    videoContainer.className = "html5-video-player";
    document.body.appendChild(videoContainer);

    subtitleContainer = document.createElement("div");
    subtitleContainer.innerHTML =
      '<span class="kiss-subtitle-word" data-word="hello">hello</span>';
    videoContainer.appendChild(subtitleContainer);

    controller = new WordTooltipController({
      getVideoContainer: () => videoContainer,
      getTimestamp: () => 1000,
    });
    controller.attachSpanListeners(subtitleContainer);
  });

  afterEach(() => {
    controller.destroy();
    jest.useRealTimers();
  });

  test("shows tooltip on hover after delay", async () => {
    const span = subtitleContainer.querySelector(".kiss-subtitle-word");
    span.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(document.querySelector(".kiss-word-tooltip")).toBeNull();

    jest.advanceTimersByTime(300);
    await Promise.resolve();

    const tooltip = document.querySelector(".kiss-word-tooltip");
    expect(tooltip).not.toBeNull();
  });

  test("keeps tooltip alive when pointer moves from word into tooltip", async () => {
    const span = subtitleContainer.querySelector(".kiss-subtitle-word");
    span.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    jest.advanceTimersByTime(300);
    await Promise.resolve();

    const tooltip = document.querySelector(".kiss-word-tooltip");
    expect(tooltip).not.toBeNull();

    // Mouse leaves word
    span.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));

    // Before the 400ms timeout fires, mouse enters tooltip
    jest.advanceTimersByTime(150);
    tooltip.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    // Advance beyond original timeout
    jest.advanceTimersByTime(500);

    // Tooltip must STILL be present
    expect(document.querySelector(".kiss-word-tooltip")).not.toBeNull();

    // Mouse leaves tooltip
    tooltip.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    jest.advanceTimersByTime(350);

    // Tooltip is now hidden
    expect(document.querySelector(".kiss-word-tooltip")).toBeNull();
  });

  test("pins tooltip on click and only unpins when clicking outside", async () => {
    const span = subtitleContainer.querySelector(".kiss-subtitle-word");
    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    const tooltip = document.querySelector(".kiss-word-tooltip");
    expect(tooltip).not.toBeNull();

    // Mouse leaves word and leaves tooltip - it should remain pinned
    span.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    jest.advanceTimersByTime(1000);
    expect(document.querySelector(".kiss-word-tooltip")).not.toBeNull();

    // Clicking outside unpins and closes
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    );
    expect(document.querySelector(".kiss-word-tooltip")).toBeNull();
  });
});
