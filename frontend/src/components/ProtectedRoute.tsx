// 路由守衛:未登入導回 /login;還在還原 session 時顯示載入中。
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "./ui";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="檢查登入狀態…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
