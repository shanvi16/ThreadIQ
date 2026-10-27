import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AnalyticsPage } from './features/insights/AnalyticsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { ProductDetailsPage } from './features/products/ProductDetailsPage';
import { ProductFormPage } from './features/products/ProductFormPage';
import { ProductsPage } from './features/products/ProductsPage';
import { RecordSalePage } from './features/sales/RecordSalePage';
import { SaleDetailsPage } from './features/sales/SaleDetailsPage';
import { SalesHistoryPage } from './features/sales/SalesHistoryPage';
import { NotFoundPage } from './app/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:id" element={<ProductDetailsPage />} />
        <Route path="products/:id/edit" element={<ProductFormPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="sales" element={<SalesHistoryPage />} />
        <Route path="sales/new" element={<RecordSalePage />} />
        <Route path="sales/:id" element={<SaleDetailsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
