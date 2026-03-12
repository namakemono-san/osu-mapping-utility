import ReactDOM from "react-dom/client";
import { message } from "@tauri-apps/plugin-dialog";

import App from "./App";

import { I18nProvider } from "./hooks/i18nContext";
import { startConnection } from "@/utils/signalr";
import { AppStateProvider } from "./hooks/appState";

startConnection().then((ok) => {
  if (!ok) {
    message(
      "バックエンドサーバーの起動に失敗しました。アプリを再起動してください。",
      { title: "接続エラー", kind: "error" }
    );
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <I18nProvider>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </I18nProvider>
);
