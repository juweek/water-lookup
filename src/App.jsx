import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import WaterPage from './pages/WaterPage.jsx';

export default function App() {
  return (
    <Router
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Layout>
        <Routes>
          <Route path="/" element={<WaterPage />} />
          <Route path="/:query" element={<WaterPage />} />
          <Route path="*" element={<WaterPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
