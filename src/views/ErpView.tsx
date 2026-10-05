import BomPage from "./erp/BomPage";
import DashboardPage from "./erp/DashboardPage";
import InventoryPage from "./erp/InventoryPage";
import MaterialsPage from "./erp/MaterialsPage";
import PurchaseDemandsPage from "./erp/PurchaseDemandsPage";
import PurchaseOrdersPage from "./erp/PurchaseOrdersPage";
import StockCheckPage from "./erp/StockCheckPage";
import StockInPage from "./erp/StockInPage";
import StockOutPage from "./erp/StockOutPage";
import StockTransfersPage from "./erp/StockTransfersPage";
import SuppliersPage from "./erp/SuppliersPage";
import SupplierDeliveriesPage from "./erp/SupplierDeliveriesPage";
import WarehousePage from "./erp/WarehousePage";

/**
 * ERP 容器：App.tsx 把 erp-* 视图 id 的子路径剥出来传给 sub，
 * 深链参数（如 /erp/inventory?alertOnly=1、/erp/stock-in?purchaseOrderId=xx、
 * /erp/purchase-orders/:id）透传给各页。
 */
export default function ErpView({ sub, initialFilters }: { sub: string; initialFilters?: Record<string, string | undefined> }) {
  switch (sub) {
    case "dashboard":
      return <DashboardPage />;
    case "materials":
      return <MaterialsPage />;
    case "bom":
      return <BomPage />;
    case "warehouse":
      return <WarehousePage />;
    case "stock-in":
      return <StockInPage initialFilters={initialFilters} />;
    case "stock-out":
      return <StockOutPage />;
    case "stock-transfers":
      return <StockTransfersPage />;
    case "stock-check":
      return <StockCheckPage />;
    case "suppliers":
      return <SuppliersPage />;
    case "purchase-demands":
      return <PurchaseDemandsPage />;
    case "purchase-orders":
      return <PurchaseOrdersPage initialFilters={initialFilters} />;
    case "supplier-deliveries":
      return <SupplierDeliveriesPage />;
    case "inventory":
    default:
      return <InventoryPage initialFilters={initialFilters} />;
  }
}
