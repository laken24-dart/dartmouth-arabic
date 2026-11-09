import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { bootstrapSession, useSession } from "./lib/auth";
import Shell from "./components/Shell";
import Welcome from "./pages/Welcome";
import Today from "./pages/Today";
import Path from "./pages/Path";
import Words from "./pages/Words";
import Cards from "./pages/Cards";
import Quiz from "./pages/Quiz";
import Grammar from "./pages/Grammar";
import TeacherLogin from "./pages/TeacherLogin";
import TeacherPlatform from "./pages/TeacherPlatform";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

function LearnerLayout() {
  const session = useSession();
  if (!session) return <Navigate to="/welcome" replace />;
  return <Shell />;
}

function Teacher({ children }) {
  const session = useSession();
  if (session?.role !== "teacher") return <Navigate to="/teach/login" replace />;
  return children;
}

export default function App() {
  const session = useSession();
  useEffect(() => { bootstrapSession(); }, []);
  if (session === undefined) {
    return <div className="boot" aria-live="polite"><span className="seal">د</span><span className="mono muted">Opening your notebook…</span></div>;
  }
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/teach/login" element={<TeacherLogin />} />
        <Route path="/teach" element={<Teacher><TeacherPlatform /></Teacher>} />
        <Route element={<LearnerLayout />}>
          <Route index element={<Today />} />
          <Route path="path" element={<Path />} />
          <Route path="words" element={<Words />} />
          <Route path="cards" element={<Cards />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="grammar" element={<Grammar />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
