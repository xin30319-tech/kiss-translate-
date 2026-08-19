import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SUBTITLE_SETTING } from "../config";
import { Menus } from "./Menus";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderMenus({ autoTranslate = true, updateSetting = jest.fn() } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <Menus
        i18n={(key) => key}
        formData={{
          segSlug: "-",
          skipAd: false,
          isBilingual: true,
          blurTranslation: false,
          autoTranslate,
          aiContextSlug: "-",
        }}
        updateSetting={updateSetting}
        downloadSubtitle={jest.fn()}
        transApis={[]}
      />
    );
  });

  return {
    container,
    updateSetting,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("subtitle Menus", () => {
  test("keeps immediate translation enabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoTranslate).toBe(true);
  });

  test("keeps automatic subtitle word favorites disabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoFavWord).toBe(false);
  });

  test("renders translation first and updates the current video state", () => {
    const view = renderMenus({ autoTranslate: false });
    const label = Array.from(view.container.querySelectorAll("div")).find(
      (element) =>
        element.textContent === "enable_subtitle_translate" &&
        element.children.length === 0
    );

    expect(
      view.container.textContent.startsWith("enable_subtitle_translate")
    ).toBe(true);

    act(() => {
      label.parentElement.click();
    });

    expect(view.updateSetting).toHaveBeenCalledWith({
      name: "autoTranslate",
      value: true,
      updatedTransApis: undefined,
    });
    view.cleanup();
  });

  test("opens ApiKeyModal when selecting unconfigured AI API and saves key", () => {
    const updateSetting = jest.fn();
    const transApis = [
      {
        apiSlug: "deepseek",
        apiName: "DeepSeek",
        apiType: "DeepSeek",
        apiKey: "",
        isDisabled: false,
      },
    ];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Menus
          i18n={(key, fallback) => fallback || key}
          formData={{
            segSlug: "-",
            skipAd: false,
            isBilingual: true,
            blurTranslation: false,
            autoTranslate: true,
            aiContextSlug: "-",
          }}
          updateSetting={updateSetting}
          downloadSubtitle={jest.fn()}
          transApis={transApis}
        />
      );
    });

    // 找到 AI 智能断句的 Select 组件（包含 ai_segmentation 标签）
    const segSelectLabel = Array.from(
      container.querySelectorAll("div")
    ).find((el) => el.textContent === "ai_segmentation");
    expect(segSelectLabel).toBeTruthy();

    // 点击打开下拉菜单
    act(() => {
      segSelectLabel.parentElement.click();
    });

    // 找到 DeepSeek 选项文本所在的 span
    const optionSpan = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "DeepSeek"
    );
    expect(optionSpan).toBeTruthy();

    // 点击该未配置选项，应当弹出 ApiKeyModal 弹窗
    act(() => {
      optionSpan.parentElement.click();
    });

    expect(container.textContent).toContain("配置 DeepSeek");
    expect(container.textContent).toContain("保存并启用");

    // 找到 input 输入框并输入 API Key
    const inputEl = container.querySelector('input[placeholder*="API Key"]');
    expect(inputEl).toBeTruthy();

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputEl, "sk-test-key-123456");
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 找到并点击“保存并启用”按钮
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "保存并启用"
    );
    expect(saveBtn).toBeTruthy();

    act(() => {
      saveBtn.click();
    });

    // 校验 updateSetting 是否携带更新后的 transApis 和选中的 segSlug
    expect(updateSetting).toHaveBeenCalledWith({
      name: "segSlug",
      value: "deepseek",
      updatedTransApis: [
        {
          apiSlug: "deepseek",
          apiName: "DeepSeek",
          apiType: "DeepSeek",
          key: "sk-test-key-123456",
          apiKey: "sk-test-key-123456",
          isDisabled: false,
        },
      ],
    });

    act(() => root.unmount());
    container.remove();
  });

  test("allows modifying API key on an already configured AI via the edit button", () => {
    const updateSetting = jest.fn();
    const transApis = [
      {
        apiSlug: "deepseek",
        apiName: "DeepSeek",
        apiType: "DeepSeek",
        key: "sk-old-key",
        apiKey: "sk-old-key",
        isDisabled: false,
      },
    ];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Menus
          i18n={(key, fallback) => fallback || key}
          formData={{
            segSlug: "deepseek",
            skipAd: false,
            isBilingual: true,
            blurTranslation: false,
            autoTranslate: true,
            aiContextSlug: "-",
          }}
          updateSetting={updateSetting}
          downloadSubtitle={jest.fn()}
          transApis={transApis}
        />
      );
    });

    // 找到当前已选中的 DeepSeek 旁边的 [改Key] 按钮
    const editBtn = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent.includes("改Key")
    );
    expect(editBtn).toBeTruthy();

    // 点击 [改Key] 按钮打开弹窗
    act(() => {
      editBtn.click();
    });

    expect(container.textContent).toContain("配置 DeepSeek");
    const inputEl = container.querySelector('input[placeholder*="API Key"]');
    expect(inputEl).toBeTruthy();
    expect(inputEl.value).toBe("sk-old-key");

    // 输入新 key 并保存
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputEl, "sk-new-valid-key");
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "保存并启用"
    );
    act(() => {
      saveBtn.click();
    });

    expect(updateSetting).toHaveBeenCalledWith({
      name: "segSlug",
      value: "deepseek",
      updatedTransApis: [
        {
          apiSlug: "deepseek",
          apiName: "DeepSeek",
          apiType: "DeepSeek",
          key: "sk-new-valid-key",
          apiKey: "sk-new-valid-key",
          isDisabled: false,
        },
      ],
    });

    act(() => root.unmount());
    container.remove();
  });
});

