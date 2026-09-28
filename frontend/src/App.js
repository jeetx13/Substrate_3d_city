import { BrowserRouter, Routes, Route } from "react-router-dom";
import Experience from "@/pages/Experience";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Experience />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </BrowserRouter>
  );
}
