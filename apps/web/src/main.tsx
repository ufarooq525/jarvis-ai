import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { JarvisProvider } from "./store/JarvisProvider";
import { Shell } from "./Shell";
import { BoardPage } from "./BoardPage";
import { GoalsPage } from "./GoalsPage";
import { ActivityPage } from "./ActivityPage";
import { ApprovalsPage } from "./ApprovalsPage";
import { SettingsPage } from "./SettingsPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <JarvisProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<BoardPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="new" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </JarvisProvider>
    </BrowserRouter>
  </StrictMode>,
);
