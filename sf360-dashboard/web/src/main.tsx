import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";
import { initFirebase } from "./firebase";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { DeniedPage, ErrorPage, LoginPage, VerifyEmailPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { OrdersPage } from "./pages/Orders";

// Less-used pages load on demand so the first screen opens fast on phones.
const NewShipmentPage = lazy(() => import("./pages/NewShipment").then((m) => ({ default: m.NewShipmentPage })));
const BulkUploadPage = lazy(() => import("./pages/BulkUpload").then((m) => ({ default: m.BulkUploadPage })));
const OrderDetailPage = lazy(() => import("./pages/OrderDetail").then((m) => ({ default: m.OrderDetailPage })));
const PickupsPage = lazy(() => import("./pages/Pickups").then((m) => ({ default: m.PickupsPage })));
const NewReturnPage = lazy(() => import("./pages/NewReturn").then((m) => ({ default: m.NewReturnPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })));

function Gate() {
  const { state } = useAuth();
  switch (state.phase) {
    case "loading":
      return <Spinner label="Opening…" />;
    case "signed-out":
      return <LoginPage />;
    case "unverified":
      return <VerifyEmailPage />;
    case "denied":
      return <DeniedPage message={state.message} />;
    case "error":
      return <ErrorPage message={state.message} />;
    case "ready":
      return (
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage kind="forward" />} />
            <Route path="orders/:awb" element={<OrderDetailPage />} />
            <Route path="new" element={<NewShipmentPage />} />
            <Route path="bulk" element={<BulkUploadPage />} />
            <Route path="pickups" element={<PickupsPage />} />
            <Route path="returns" element={<OrdersPage kind="reverse" />} />
            <Route path="returns/new" element={<NewReturnPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </Suspense>
      );
  }
}

const root = createRoot(document.getElementById("root")!);

initFirebase()
  .then(() => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </StrictMode>,
    );
  })
  .catch((err: Error) => {
    root.render(
      <div className="mx-auto max-w-md p-6 text-sm">
        <p className="font-semibold">The app could not start.</p>
        <p className="mt-2 text-ink-3">{err.message}</p>
      </div>,
    );
  });
