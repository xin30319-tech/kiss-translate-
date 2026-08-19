import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Homepage from "./App";

jest.mock("@mui/material/styles/ThemeProvider", () => {
  return function MockThemeProvider({ children }) {
    return children;
  };
});

const videoIds = ["KcU2RpGkyvM", "l8lbWnyeda4", "QAiz68_jCQQ", "vo-XbIQ_GKg"];

describe("homepage video showcase", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test("uses official YouTube embeds with external watch fallbacks", () => {
    act(() => root.render(<Homepage />));

    const iframes = [...container.querySelectorAll("iframe")];
    const watchLinks = [
      ...container.querySelectorAll(
        'a[href^="https://www.youtube.com/watch?v="]'
      ),
    ];

    expect(iframes).toHaveLength(videoIds.length);
    expect(watchLinks).toHaveLength(videoIds.length);

    videoIds.forEach((videoId, index) => {
      expect(iframes[index].getAttribute("src")).toBe(
        `https://www.youtube.com/embed/${videoId}`
      );
      expect(iframes[index].getAttribute("referrerpolicy")).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(iframes[index].getAttribute("src")).not.toContain("si=");
      expect(watchLinks[index].getAttribute("href")).toBe(
        `https://www.youtube.com/watch?v=${videoId}`
      );
      expect(watchLinks[index].getAttribute("target")).toBe("_blank");
      expect(watchLinks[index].getAttribute("rel")).toBe("noopener noreferrer");
    });

    expect(container.innerHTML).not.toContain("youtube-nocookie.com");
  });
});
