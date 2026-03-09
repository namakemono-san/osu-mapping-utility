import ReactDOM from "react-dom/client";

import App from "./App";

import { I18nProvider } from "./hooks/i18nContext";
import { startConnection } from "@/utils/signalr";
import { AppStateProvider } from "./hooks/appState";

startConnection();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <I18nProvider>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </I18nProvider>
);
