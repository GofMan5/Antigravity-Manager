import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import App from './App';
import './i18n'; // Import i18n config
import "./App.css";
import { queryClient } from "./lib/query-client";

import { isTauri } from "./utils/env";
// 启动时显式调用 Rust 命令显示窗口
// 配合 visible:false 使用，解决启动黑屏问题
if (isTauri()) {
  invoke("show_main_window").catch(console.error);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
        <App />
        <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
