import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Mandates from "./pages/Mandates";
import MandateDetail from "./pages/MandateDetail";
import RunView from "./pages/RunView";
import Approvals from "./pages/Approvals";
import AttackLab from "./pages/AttackLab";
import AuditLog from "./pages/AuditLog";
import Connect from "./pages/Connect";
import ControlTower from "./pages/ControlTower";
import Runs from "./pages/Runs";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import { AuthProvider } from "./auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="home" element={<Landing />} />
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="mandates" element={<Mandates />} />
          <Route path="mandates/:id" element={<MandateDetail />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:id" element={<RunView />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="lab" element={<AttackLab />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="connect" element={<Connect />} />
          <Route path="tower" element={<ControlTower />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
