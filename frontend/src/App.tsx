import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import OrdersListPage from "./pages/OrdersListPage";
import OrderFormPage from "./pages/OrderFormPage";
import BuildChooserPage from "./pages/BuildChooserPage";
import MastersPage from "./pages/MastersPage";
import SalesStatementPage from "./pages/SalesStatementPage";
import SettingsPage from "./pages/SettingsPage";

// 懶載入含重型套件的頁面,減少首次載入體積
const VisualOrderPage = lazy(() => import("./pages/VisualOrderPage")); // React Flow
const ReportsPage = lazy(() => import("./pages/ReportsPage")); // Recharts

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* 需登入的區域,套上 Layout(側邊/底部導覽) */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/build" element={<BuildChooserPage />} />
        <Route path="/orders/new" element={<OrderFormPage />} />
        <Route path="/orders/visual" element={<Suspense fallback={<Spinner />}><VisualOrderPage /></Suspense>} />
        <Route path="/orders/:id/edit" element={<OrderFormPage />} />
        <Route path="/reports" element={<Suspense fallback={<Spinner />}><ReportsPage /></Suspense>} />
        <Route path="/sales" element={<SalesStatementPage />} />
        <Route path="/masters" element={<MastersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* 預設導向訂單清單 */}
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
