import Fab from "@mui/material/Fab";
import TranslateIcon from "@mui/icons-material/Translate";
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useState, useMemo, useCallback, useEffect } from "react";
import { SettingProvider } from "../../hooks/Setting";
import { MSG_TRANS_TOGGLE, MSG_POPUP_TOGGLE } from "../../config";
import useWindowSize from "../../hooks/WindowSize";
import { useFullscreenDetect } from "../../hooks/useFullscreenDetect";

/**
 * 内容页悬浮翻译球 (Floating Action Button) 组件
 * 支持拖拽、贴边吸附隐藏以及点击事件
 */
export default function ContentFab({
  fabConfig: { x: fabX, y: fabY, edge: fabEdge, fabClickAction = 0 } = {},
  processActions,
}) {
  const fabWidth = 40; // 悬浮球的固定宽度 40px
  const windowSize = useWindowSize();
  const [moved, setMoved] = useState(false); // 标记是否发生了拖动
  const [showFab, setShowFab] = useState(true);
  const { isVideoFullscreen } = useFullscreenDetect();

  useEffect(() => {
    setShowFab(!isVideoFullscreen);
  }, [isVideoFullscreen]);

  // 拖拽开始时的回调
  const handleStart = useCallback(() => {
    setMoved(false);
  }, []);

  // 拖拽移动中的回调
  const handleMove = useCallback(() => {
    setMoved(true);
  }, []);

  // 处理点击事件。如果拖拽移动过，则忽略该次点击，防止误触
  const handleClick = useCallback(() => {
    if (!moved) {
      // 单击悬浮球：直接立即触发当前页面的全文双语翻译
      processActions({ action: MSG_TRANS_TOGGLE });
    }
  }, [moved, processActions]);

  // 右键点击悬浮球：直接弹出快捷控制面板与设置菜单
  const handleContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      processActions({ action: MSG_POPUP_TOGGLE });
    },
    [processActions]
  );

  // 计算悬浮球的位置参数，如果是初次加载则放置在视口垂直居中、贴在边缘的位置
  const fabProps = useMemo(
    () => ({
      windowSize,
      width: fabWidth,
      height: fabWidth,
      left: fabX ?? -fabWidth,
      top: fabY ?? windowSize.h / 2,
      edge: fabEdge,
    }),
    [windowSize, fabWidth, fabX, fabY, fabEdge]
  );

  return (
    <SettingProvider context="fab">
      <ThemeProvider>
        <Draggable
          key="fab"
          snapEdge // 启用贴边吸附隐藏效果
          {...fabProps}
          show={showFab}
          onStart={handleStart}
          onMove={handleMove}
          handler={
            <Fab
              size="small"
              color="primary"
              onClick={handleClick}
              onContextMenu={handleContextMenu}
              title="单击：立即翻译当前页面 / 右键：打开功能设置菜单"
            >
              <TranslateIcon
                sx={{
                  width: 24,
                  height: 24,
                }}
              />
            </Fab>
          }
        />
      </ThemeProvider>
    </SettingProvider>
  );
}
