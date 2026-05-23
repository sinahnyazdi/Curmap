import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { CurmapPage } from "./pages/CurmapPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/curmaps/:id" element={<CurmapPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
