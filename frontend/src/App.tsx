import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import OrdersListPage from "./pages/OrdersListPage";
import OrderFormPage from "./pages/OrderFormPage";
import MastersPage from "./pages/MastersPage";
import ReportsPage from "./pages/ReportsPage";

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
        <Route path="/orders/new" element={<OrderFormPage />} />
        <Route path="/orders/:id/edit" element={<OrderFormPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/masters" element={<MastersPage />} />
      </Route>

      {/* 預設導向訂單清單 */}
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
