import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useCallback, useEffect, useState } from "react";
import { useFavWords } from "../../hooks/FavWords";
import { kissLog } from "../../libs/log";
import { useSetting } from "../../hooks/Setting";
import { EVENT_FAVORITE_WORD_CHANGE } from "../../config";

/**
 * 收藏生词按钮组件 (红心图标)
 *
 * @param {Object} props
 * @param {string} props.word - 需要被收藏或取消收藏的单词
 * @param {string} props.title - 鼠标悬停提示文本
 */
export default function FavBtn({
  word,
  title,
  contextSentence = "",
  sourceTitle = "",
  sourceUrl = "",
  phonetic = "",
  definition = "",
  examples = [],
}) {
  // 使用自定义的 useFavWords 获取收藏的生词列表及切换收藏状态的方法
  const { favWords, toggleFav } = useFavWords();
  const { context, setting } = useSetting();
  const [loading, setLoading] = useState(false);
  const autoCollect =
    context === "tranbox" && setting?.tranboxSetting?.autoFavWord;

  // 点击触发收藏/取消收藏
  const handleClick = useCallback(() => {
    try {
      setLoading(true);
      const isFavorite = !favWords[word];
      const pageTitle =
        sourceTitle ||
        (typeof document !== "undefined" && document.title
          ? document.title.replace(/\s*-\s*YouTube$/i, "").trim()
          : "");
      const pageUrl =
        sourceUrl ||
        (typeof window !== "undefined" &&
        window.location &&
        window.location.href !== "http://localhost/"
          ? window.location.href
          : "");

      if (
        contextSentence ||
        pageTitle ||
        pageUrl ||
        phonetic ||
        definition ||
        (examples && examples.length > 0)
      ) {
        toggleFav(word, {
          contextSentence: contextSentence || "",
          sourceTitle: pageTitle,
          sourceUrl: pageUrl,
          phonetic: phonetic || "",
          definition: definition || "",
          examples: examples || [],
        });
      } else {
        toggleFav(word);
      }
      document.dispatchEvent(
        new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
          detail: { word, isFavorite },
        })
      );
    } catch (err) {
      kissLog("set fav", err);
    } finally {
      setLoading(false);
    }
  }, [
    contextSentence,
    definition,
    examples,
    favWords,
    phonetic,
    sourceTitle,
    sourceUrl,
    toggleFav,
    word,
  ]);

  useEffect(() => {
    if (autoCollect && word && !favWords[word]) {
      handleClick();
    }
  }, [autoCollect, favWords, handleClick, word]);

  return (
    <IconButton
      disabled={loading}
      size="small"
      onClick={handleClick}
      title={title}
    >
      {/* 如果单词已存在于生词本中，渲染实心红心，否则为空心红心 */}
      {favWords[word] ? (
        <FavoriteIcon fontSize="inherit" color="error" />
      ) : (
        <FavoriteBorderIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
