import en from "../../../messages/en.json";
import zhTw from "../../../messages/zh-tw.json";

// 靜態翻譯檔（base / fallback）；翻譯編輯器以此為基準呈現所有可編輯鍵
export const staticMessages: Record<string, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  "zh-tw": zhTw as Record<string, unknown>,
};
