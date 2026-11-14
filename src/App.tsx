import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { I18nProvider } from './i18n';
import { Forwarder } from './screens/Forwarder';
import { Monitor } from './screens/Monitor';
import { Recovery } from './screens/Recovery';
import { Shipment } from './screens/Shipment';
import { useDemo } from './state/demo';

export function App() {
  const { pathname } = useLocation();
  const { state } = useDemo();
  const routes = (
    <Routes>
      <Route path="/" element={<Monitor />} />
      <Route path="/recovery" element={<Recovery />} />
      <Route path="/shipment/:awb" element={<Shipment />} />
      <Route path="/forwarder/:awb" element={<Forwarder />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
  return (
    <I18nProvider locale={state.locale}>
      <div lang={state.locale === 'zh' ? 'zh-Hant' : 'en'}>
        {pathname.startsWith('/forwarder/') ? routes : <Shell>{routes}</Shell>}
      </div>
    </I18nProvider>
  );
}
