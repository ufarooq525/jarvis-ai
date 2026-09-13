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
import { EntitiesPage } from "./EntitiesPage";
import { MissionPage } from "./MissionPage";
import { ComputerPage } from "./ComputerPage";
import { BrowserPage } from "./BrowserPage";
import { SkillsPage } from "./SkillsPage";
import { OpsPage } from "./OpsPage";
import { ModelsPage } from "./ModelsPage";
import { GoalDetailPage } from "./GoalDetailPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <JarvisProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<BoardPage />} />
            <Route path="mission" element={<MissionPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="goals/:id" element={<GoalDetailPage />} />
            <Route path="world" element={<EntitiesPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="ops" element={<OpsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="computer" element={<ComputerPage />} />
            <Route path="browser" element={<BrowserPage />} />
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
