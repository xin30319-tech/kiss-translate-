import { useCallback, useMemo, useState } from "react";
import { API_SPE_TYPES, isApiConfigured } from "../config";
import { browser } from "../libs/browser";

/**
 * Label 组件 - 单行文本溢出省略包装标签
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - 标签子节点文本内容
 */
function Label({ children }) {
  return (
    <div
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/**
 * MenuItem 组件 - 菜单单项卡片包装器
 * 支持鼠标悬浮 (hover) 时的背景色渐变高亮与不透明度过渡过渡效果
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - 子元素内容
 * @param {Function} props.onClick - 点击事件回调
 * @param {boolean} [props.disabled=false] - 是否禁用点击
 */
function MenuItem({ children, onClick, disabled = false }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 8px",
        opacity: hover ? 1 : 0.8,
        background: `rgba(255, 255, 255, ${hover ? 0.1 : 0})`,
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.2s, opacity 0.2s",
        borderRadius: 5,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * Switch 组件 - 开关 (Toggle Switch) 菜单组件
 *
 * @param {object} props
 * @param {string} props.label - 开关文本标题
 * @param {string} props.name - 配置表单中的字段 Key 名
 * @param {boolean} props.value - 当前开关状态值 (true 为开启，false 为关闭)
 * @param {Function} props.onChange - 开关改变时的回调通知
 * @param {boolean} props.disabled - 是否禁用该开关
 */
function Switch({ label, name, value, onChange, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    // 点击时状态取反派发
    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
      {/* 开关轨道 (Track) */}
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: value ? "rgba(32,156,238,.8)" : "rgba(255,255,255,.3)",
          position: "relative",
        }}
      >
        {/* 开关滑块 (Thumb) */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            position: "absolute",
            left: 2,
            top: 2,
            background: "rgba(255,255,255,.9)",
            transform: `translateX(${value ? 16 : 0}px)`,
          }}
        ></div>
      </div>
    </MenuItem>
  );
}

/**
 * Select 组件 - 下拉选择菜单组件 (Select Component)
 *
 * @param {object} props
 * @param {string} props.label - 下拉标题文本
 * @param {string} props.name - 表单字段 Key 名
 * @param {*} props.value - 当前选中的值
 * @param {Array<object>} props.options - 下拉选项数组，每一项为 { value, label, isConfigured, api }
 * @param {Function} props.onChange - 选项改变时的回调
 * @param {Function} [props.onNeedConfig] - 当选中未配置 Key 的 API 时的快捷配置回调
 * @param {boolean} props.disabled - 是否禁用下拉框
 */
function Select({
  label,
  name,
  value,
  options,
  onChange,
  onNeedConfig,
  disabled,
}) {
  const [isOpen, setIsOpen] = useState(false); // 控制下拉菜单面板的展开/收起状态

  // 查找当前被选中的选项，若没匹配到则回退至第一个可选项以做安全兜底
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || options[0],
    [options, value]
  );

  // 切换下拉菜单展开收起
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  // 选中下拉具体选项时，如果未配置 Key 则唤起配置弹窗，否则派发 onChange 事件
  const handleSelect = useCallback(
    (option) => {
      if (option.api && !option.isConfigured) {
        setIsOpen(false);
        if (onNeedConfig) {
          onNeedConfig({ api: option.api, targetField: name });
        }
        return;
      }
      onChange({ name, value: option.value });
      setIsOpen(false);
    },
    [onChange, name, onNeedConfig]
  );

  return (
    <div style={{ position: "relative" }}>
      <MenuItem onClick={handleToggle} disabled={disabled}>
        <Label>{label}</Label>
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {selectedOption?.label || ""}
          </span>
          {selectedOption?.api && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (onNeedConfig) {
                  onNeedConfig({ api: selectedOption.api, targetField: name });
                }
              }}
              title={
                selectedOption.isConfigured
                  ? "修改 API Key / Edit Key"
                  : "填写 API Key / Fill Key"
              }
              style={{
                cursor: "pointer",
                padding: "1px 5px",
                borderRadius: 4,
                background: selectedOption.isConfigured
                  ? "rgba(32, 156, 238, 0.25)"
                  : "rgba(255, 167, 38, 0.3)",
                color: selectedOption.isConfigured ? "#209cee" : "#ffa726",
                fontSize: 10,
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              🔑 {selectedOption.isConfigured ? "改Key" : "填Key"}
            </span>
          )}
        </div>
      </MenuItem>
      {/* 下拉浮出面板 */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            background: "rgba(18, 22, 28, 0.95)",
            backdropFilter: "blur(10px)",
            borderRadius: 6,
            minWidth: 260,
            maxHeight: 220,
            overflow: "auto",
            zIndex: 1000,
            marginTop: 4,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
          }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background:
                  option.value === value
                    ? "rgba(32,156,238,.3)"
                    : "transparent",
                opacity: option.value === value ? 1 : 0.85,
                transition: "all 0.2s",
                fontSize: 14,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  option.value === value
                    ? "rgba(32,156,238,.3)"
                    : "transparent";
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {option.label}
              </span>
              {option.api && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    if (onNeedConfig) {
                      onNeedConfig({ api: option.api, targetField: name });
                    }
                  }}
                  title={
                    option.isConfigured
                      ? "修改此 API Key / Edit Key"
                      : "填写此 API Key / Fill Key"
                  }
                  style={{
                    fontSize: 11,
                    color: option.isConfigured ? "#209cee" : "#ffa726",
                    background: option.isConfigured
                      ? "rgba(32, 156, 238, 0.2)"
                      : "rgba(255, 167, 38, 0.2)",
                    border: option.isConfigured
                      ? "1px solid rgba(32, 156, 238, 0.4)"
                      : "1px solid rgba(255, 167, 38, 0.4)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    marginLeft: 6,
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                >
                  {option.isConfigured ? "改Key" : "填Key"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ApiKeyModal 组件 - 视频播放器上快速填写/配置 API Key 的弹窗
 *
 * @param {object} props
 * @param {object} props.configData - 包含 { api, targetField }
 * @param {Function} props.i18n - 国际化函数
 * @param {Function} props.onClose - 关闭弹窗回调
 * @param {Function} props.onSave - 保存 Key 并启用回调
 */
function ApiKeyModal({ configData, i18n, onClose, onSave }) {
  const { api, targetField } = configData;
  const [apiKey, setApiKey] = useState(api.key || api.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = useCallback(() => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey && api.apiType !== "Ollama") {
      setErrorMsg(i18n("api_key_empty", "请输入有效 API Key"));
      return;
    }
    onSave({
      apiSlug: api.apiSlug,
      apiKey: trimmedKey,
      targetField,
    });
  }, [apiKey, api, targetField, i18n, onSave]);

  const handleOpenFullSettings = useCallback(() => {
    try {
      if (
        typeof globalThis.chrome !== "undefined" &&
        globalThis.chrome?.runtime?.openOptionsPage
      ) {
        globalThis.chrome.runtime.openOptionsPage();
      } else if (browser?.runtime?.openOptionsPage) {
        browser.runtime.openOptionsPage();
      }
    } catch (e) {}
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: 250,
        background: "rgba(20, 24, 30, 0.95)",
        backdropFilter: "blur(12px)",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.25)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7)",
        padding: "12px 14px",
        zIndex: 2000,
        color: "#fff",
        fontSize: 13,
        lineHeight: 1.4,
        boxSizing: "border-box",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          fontWeight: "bold",
          fontSize: 14,
        }}
      >
        <span>🔑 配置 {api.apiName}</span>
        <span
          onClick={onClose}
          style={{
            cursor: "pointer",
            opacity: 0.7,
            fontSize: 18,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
        {api.key || api.apiKey
          ? "当前已配置 Key，如需更换请在下方直接粘贴新的 API Key："
          : i18n(
              "api_key_required_hint",
              `该服务尚未填写 API Key。请输入 Key 以启用 AI 智能断句与翻译：`
            )}
      </div>
      <div style={{ position: "relative", marginBottom: 6 }}>
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          autoFocus
          onFocus={(e) => e.target.select()}
          placeholder="在此粘贴 API Key..."
          onChange={(e) => {
            setApiKey(e.target.value);
            if (errorMsg) setErrorMsg("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onClose();
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(0, 0, 0, 0.6)",
            border: errorMsg
              ? "1px solid #f44336"
              : "1px solid rgba(255, 255, 255, 0.3)",
            borderRadius: 4,
            padding: "6px 28px 6px 8px",
            color: "#fff",
            fontSize: 12,
            outline: "none",
          }}
        />
        <span
          onClick={() => setShowKey((prev) => !prev)}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            cursor: "pointer",
            fontSize: 12,
            opacity: 0.75,
            userSelect: "none",
          }}
          title={showKey ? "隐藏" : "显示"}
        >
          {showKey ? "🙈" : "👁️"}
        </span>
      </div>
      {errorMsg && (
        <div style={{ color: "#f44336", fontSize: 11, marginBottom: 6 }}>
          {errorMsg}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <button
          type="button"
          onClick={handleOpenFullSettings}
          style={{
            background: "transparent",
            border: "none",
            color: "#209cee",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          {i18n("full_settings", "更多设置")}
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              color: "#fff",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {i18n("cancel", "取消")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: "#209cee",
              border: "none",
              color: "#fff",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {i18n("save_and_enable", "保存并启用")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Button 组件 - 简单按钮菜单项组件
 *
 * @param {object} props
 * @param {string} props.label - 按钮上的文本内容
 * @param {Function} props.onClick - 点击按钮的回调事件
 * @param {boolean} props.disabled - 是否禁用按钮
 */
function Button({ label, onClick, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onClick();
  }, [disabled, onClick]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
    </MenuItem>
  );
}

/**
 * Menus 组件 - 视频字幕设置快捷快捷菜单浮动面板组件
 * 用于在视频网页播放器上层叠展示，控制 AI 智能分句、AI 上下文增强、双语显示等配置项
 *
 * @param {object} props
 * @param {Function} props.i18n - 国际化翻译转换函数
 * @param {object} props.formData - 表单绑定配置数据对象
 * @param {number} [props.progressed=0] - 字幕处理/下载进度百分比数值 (0 - 100)
 * @param {Function} props.updateSetting - 更新全局/字幕配置项的回调函数
 * @param {Function} props.downloadSubtitle - 点击触发下载双语字幕的回调函数
 * @param {Array<object>} props.transApis - 系统当前配置的翻译 API 列表
 */
export function Menus({
  i18n,
  formData,
  progressed = 0,
  updateSetting,
  downloadSubtitle,
  togglePipWindow,
  transApis,
}) {
  const [configModal, setConfigModal] = useState(null);

  // 当快捷菜单的任何子选项发生更改时，统一向上层派发更新事件
  const handleChange = useCallback(
    ({ name, value, updatedTransApis }) => {
      updateSetting({ name, value, updatedTransApis });
    },
    [updateSetting]
  );

  const handleSaveApiKey = useCallback(
    ({ apiSlug, apiKey, targetField }) => {
      const updatedApis = (transApis || []).map((api) => {
        if (api.apiSlug === apiSlug) {
          return {
            ...api,
            key: apiKey,
            apiKey,
            isDisabled: false,
          };
        }
        return api;
      });

      setConfigModal(null);
      updateSetting({
        name: targetField,
        value: apiSlug,
        updatedTransApis: updatedApis,
      });
    },
    [transApis, updateSetting]
  );

  // 过滤并计算出当前所有未禁用的翻译 API 列表，用于 UI 下拉列表展示
  const enabledApis = useMemo(
    () => (transApis || []).filter((api) => !api.isDisabled),
    [transApis]
  );

  // 进一步过滤出其中属于 AI 大语言模型翻译类型的 API
  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  // 构造 AI 智能断句服务下拉列表选项 (若没有启用的 AI 接口，则下拉项仅有禁用)
  const segOptions = useMemo(() => {
    const options = [
      { value: "-", label: i18n("disable") || "禁用", isConfigured: true },
    ];
    aiEnabledApis.forEach((api) => {
      const configured = isApiConfigured(api);
      options.push({
        value: api.apiSlug,
        label: api.apiName,
        isConfigured: configured,
        api,
      });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 构造 AI 视频上下文增强服务下拉列表选项 (若没有启用的 AI 接口，则下拉项仅有禁用)
  const aiContextOptions = useMemo(() => {
    const options = [
      { value: "-", label: i18n("disable") || "禁用", isConfigured: true },
    ];
    aiEnabledApis.forEach((api) => {
      const configured = isApiConfigured(api);
      options.push({
        value: api.apiSlug,
        label: api.apiName,
        isConfigured: configured,
        api,
      });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 根据当前字幕处理/翻译进度值，动态计算快捷菜单底部的下载按钮状态文案
  const status = useMemo(() => {
    if (progressed === 0) return i18n("waiting_subtitles");
    if (progressed === 100) return i18n("download_subtitles");
    return i18n("processing_subtitles");
  }, [progressed, i18n]);

  // 从表单配置对象中解构出字幕交互相关的控制值
  const {
    segSlug, // 选中的智能断句大模型 apiSlug
    skipAd, // 是否开启自动跳过广告
    isBilingual, // 是否采用双语对照视图显示
    blurTranslation, // 是否启用模糊隐藏译文，悬浮时显示的背词模式
    autoTranslate, // 当前视频是否开启字幕翻译
    aiContextSlug, // 选中的上下文增强服务 apiSlug
  } = formData;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 100,
        background: "rgba(0,0,0,.6)",
        width: 250,
        lineHeight: "40px",
        fontSize: 16,
        padding: 8,
        borderRadius: 5,
      }}
    >
      {/* 当前视频的翻译开关 */}
      <Switch
        onChange={handleChange}
        name="autoTranslate"
        value={autoTranslate}
        label={i18n("enable_subtitle_translate")}
      />
      {/* 智能断句下拉项：若可用 AI 大模型数量为 0 时禁用下拉 */}
      <Select
        onChange={handleChange}
        onNeedConfig={(configData) => setConfigModal(configData)}
        name="segSlug"
        value={segSlug || "-"}
        options={segOptions}
        label={i18n("ai_segmentation")}
        disabled={segOptions.length <= 1}
      />
      {/* 视频上下文增强下拉项：通过 AI 预分析视频内容，帮助更准确地进行专业词汇翻译 */}
      <Select
        onChange={handleChange}
        onNeedConfig={(configData) => setConfigModal(configData)}
        name="aiContextSlug"
        value={aiContextSlug || "-"}
        options={aiContextOptions}
        label={i18n("ai_enhanced_context")}
        disabled={aiContextOptions.length <= 1}
      />
      {/* 双语对照显示开关 */}
      <Switch
        onChange={handleChange}
        name="isBilingual"
        value={isBilingual}
        label={i18n("is_bilingual_view")}
      />
      {/* 译文模糊背词开关 */}
      <Switch
        onChange={handleChange}
        name="blurTranslation"
        value={blurTranslation}
        label={i18n("is_blur_translation")}
      />
      {/* 广告跳过开关 */}
      <Switch
        onChange={handleChange}
        name="skipAd"
        value={skipAd}
        label={i18n("is_skip_ad")}
      />
      {/* 独立画中画双语字幕悬浮窗口 */}
      <Button
        label="🖼️ 开启独立画中画悬浮窗"
        onClick={() => togglePipWindow?.()}
      />
      {/* 字幕下载动作按钮：按需 AI 断句下允许下载当前已处理的字幕 */}
      <Button
        label={`${status} [${progressed}%] `}
        onClick={downloadSubtitle}
      />

      {/* 弹窗配置 API Key */}
      {configModal && (
        <ApiKeyModal
          configData={configModal}
          i18n={i18n}
          onClose={() => setConfigModal(null)}
          onSave={handleSaveApiKey}
        />
      )}
    </div>
  );
}
