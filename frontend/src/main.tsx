import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { Providers } from "./app/providers";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("缺少根节点");
}

createRoot(root).render(
  <StrictMode>
    <Providers>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);
