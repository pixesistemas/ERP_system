import { useState, useEffect, useRef } from "react";
import {
  Bot, Building2, Check, ChevronRight, CircleDollarSign, FileText, LogOut, Menu, MessageSquareText, MessageCircle, PackageSearch, Phone, ShoppingCart, RefreshCw, Send, ShieldCheck, Sparkles, UserRound, X, Users, History, Receipt, Warehouse, Boxes, Landmark, WalletCards, FileSpreadsheet, Settings, Tags, Truck, BarChart3, ClipboardList, BadgeDollarSign, CalendarDays, Percent, Building, Download, Printer, ListTree, LayoutTemplate, Maximize2
} from "lucide-react";
import { api } from "./services/api";
import { Login } from "./components/Login";
import { SuperAdminLoginPage } from "./components/SuperAdminLoginPage";
import { SuperAdminPage } from "./components/SuperAdminPage";
import { AdvancedPosPage } from "./components/pages/AdvancedPosPage";
import { BankReconciliationPage } from "./components/pages/BankReconciliationPage";
import { BanksPage } from "./components/pages/BanksPage";
import { Beta2CheckDepositsPage } from "./components/pages/Beta2CheckDepositsPage";
import { Beta2PaymentOrdersPage } from "./components/pages/Beta2PaymentOrdersPage";
import { BranchStockPage } from "./components/pages/BranchStockPage";
import { CardsPage } from "./components/pages/CardsPage";
import { CashClosuresPage } from "./components/pages/CashClosuresPage";
import { CashPage } from "./components/pages/CashPage";
import { CatalogsPage } from "./components/pages/CatalogsPage";
import { ChecksPage } from "./components/pages/ChecksPage";
import { ClientAccountsPage } from "./components/pages/ClientAccountsPage";
import { ClientsPage } from "./components/pages/ClientsPage";
import { CommercialRulesPage } from "./components/pages/CommercialRulesPage";
import { CompanyPage } from "./components/pages/CompanyPage";
import { CurrenciesPage } from "./components/pages/CurrenciesPage";
import { DashboardPage } from "./components/pages/DashboardPage";
import { DocumentDesignerPage } from "./components/pages/DocumentDesignerPage";
import { DocumentsPage } from "./components/pages/DocumentsPage";
import { DynamicOrdersReportPage } from "./components/pages/DynamicOrdersReportPage";
import { ImportProductsPage } from "./components/pages/ImportProductsPage";
import { ModulePreview } from "./components/pages/ModulePreview";
import { OperationalDocumentsPage } from "./components/pages/OperationalDocumentsPage";
import { PointOfSalesPage } from "./components/pages/PointOfSalesPage";
import { PointPrintSettings } from "./components/pages/PointPrintSettings";
import { PosComprobantesConfigPage } from "./components/pages/PosComprobantesConfigPage";
import { PriceUpdatePage } from "./components/pages/PriceUpdatePage";
import { ProductSuppliersPage } from "./components/pages/ProductSuppliersPage";
import { ProductsPage } from "./components/pages/ProductsPage";
import { PurchasesPage } from "./components/pages/PurchasesPage";
import { ReceiptsPage } from "./components/pages/ReceiptsPage";
import { ReportsPage } from "./components/pages/ReportsPage";
import { SalesReportsPage } from "./components/pages/SalesReportsPage";
import { ChangelogPage } from "./components/pages/ChangelogPage";
import { WhatsappTrayPage } from "./components/pages/WhatsappTrayPage";
import { WhatsappChatDemoPage } from "./components/pages/WhatsappChatDemoPage";
import { WhatsappEmpleadoDemoPage } from "./components/pages/WhatsappEmpleadoDemoPage";
import { WhatsappBell } from "./components/WhatsappBell";
import { empleadoEncolarMensaje } from "./utils/whatsappEmpleadoStore";
import { ReserveFundsPage } from "./components/pages/ReserveFundsPage";
import { CobroTemporalPage } from "./components/pages/CobroTemporalPage";
import { SalesHistoryPage } from "./components/pages/SalesHistoryPage";
import { SellersPage } from "./components/pages/SellersPage";
import { SettingsPage } from "./components/pages/SettingsPage";
import { ShelfLabelsPage } from "./components/pages/ShelfLabelsPage";
import { SimpleCrudPage } from "./components/pages/SimpleCrudPage";
import { StockMovementsPage } from "./components/pages/StockMovementsPage";
import { StockPage } from "./components/pages/StockPage";
import { StockTransfersPage } from "./components/pages/StockTransfersPage";
import { SuppliersPage } from "./components/pages/SuppliersPage";
import { UnitsPage } from "./components/pages/UnitsPage";
import { UsersPage } from "./components/pages/UsersPage";
import { RolesPermissionsPage } from "./components/pages/RolesPermissionsPage";
import { VatBooksPage } from "./components/pages/VatBooksPage";
import { BorradorIvaPage } from "./components/pages/BorradorIvaPage";
import { WhatsappAuthorizedPage } from "./components/pages/WhatsappAuthorizedPage";
import { WhatsappOrdersPage } from "./components/pages/WhatsappOrdersPage";
import { Info } from "./components/shared/Info";
import { ChatMessage, Conversation } from "./types";
import { examples, pageTitle, pageSubtitle, actionText, actionLabel } from "./utils/pageMeta";
import { canSeeScreen } from "./utils/screens";

export function App() {
  const [session, setSession] = useState<any>(null);
  const [appInfo, setAppInfo] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [activeResponse, setActiveResponse] = useState<any>(null);
  const [phone, setPhone] = useState(() => `WEB-${Date.now()}`);
  const [page, setPage] = useState<string>("dashboard");
  const [superadminMode, setSuperadminMode] = useState<boolean>(() => window.location.hash.startsWith("#/superadmin"));
  const [menuAbierto, setMenuAbierto] = useState(true);
  const [, setSaTick] = useState(0);
  useEffect(() => {
    const onChange = () => {
      setSuperadminMode(window.location.hash.startsWith("#/superadmin"));
      setSaTick(t => t + 1);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  useEffect(() => {
    if (!session) return;
    if (!canSeeScreen(session.pantallas ?? null, page)) setPage("dashboard");
    if (page === "cobro-temporal" && !session.modulos?.COBRO_TEMPORAL) setPage("dashboard");
  }, [session, page]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionStorage.getItem("afip_demo_token")) return;
    api.me().then(setSession).catch(() => sessionStorage.removeItem("afip_demo_token"));
  }, []);

  useEffect(() => {
    if (!session) return;
    api.getAppEstado().then(setAppInfo).catch(() => {});
  }, [session]);

  useEffect(() => {
    const tema = session?.empresa?.tema || "lavanda";
    document.documentElement.setAttribute("data-theme", tema);
  }, [session]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (session) loadHistory(); }, [session]);
  useEffect(() => {
    const selectNumeric = (event: FocusEvent) => {
      const target = event.target as HTMLInputElement;
      if (target?.tagName === "INPUT" && target.type === "number") {
        window.setTimeout(() => target.select(), 0);
      }
    };
    document.addEventListener("focusin", selectNumeric);
    return () => document.removeEventListener("focusin", selectNumeric);
  }, []);

  async function loadHistory() {
    try { const r = await api.listConversations(); setHistory(r.conversations || []); } catch {}
  }

  function newConversation() {
    setPhone(`WEB-${Date.now()}`); setMessages([]); setActiveResponse(null); setInput("");
  }

  async function send(text = input) {
    const clean = text.trim(); if (!clean || loading) return;
    setMessages(m => [...m, { id: crypto.randomUUID(), role: "user", text: clean, at: new Date() }]);
    setInput(""); setLoading(true);
    try {
      const result = await api.sendMessage({ telefono: phone, mensaje: clean });
      const response = result.response || {};
      setActiveResponse({ ...result, ...response });
      setMessages(m => [...m, { id: crypto.randomUUID(), role: "assistant", text: response.message || "Operación procesada.", at: new Date(), response }]);
      loadHistory();
    } catch (err: any) {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: "assistant", text: `No pude completar la solicitud: ${err.message}`, at: new Date() }]);
    } finally { setLoading(false); }
  }

  function logout() { sessionStorage.clear(); setSession(null); newConversation(); }

  const command = activeResponse?.command || {};
  const items = command.items || command.productos || [];
  const total = activeResponse?.response?.result?.total || command.total || null;

  if (superadminMode) {
    return sessionStorage.getItem("afip_superadmin_token")
      ? <SuperAdminPage/>
      : <SuperAdminLoginPage/>;
  }

  if (!session) return <Login onLogin={setSession}/>;
  const pantallas: string[] | null = session.pantallas ?? null;
  function canSee(key: string) { return canSeeScreen(pantallas, key); }

  return <div className={"app-shell" + (menuAbierto ? "" : " menu-hidden")}>
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="logo small"><Bot size={20}/></div><div><strong>PixeSistemas</strong><span>ERP Empresarial</span></div></div>
      <nav className="erp-nav">
        <span className="nav-title">INICIO</span>
        {canSee("dashboard")&&<a className={page === "dashboard" ? "active" : ""} onClick={()=>setPage("dashboard")}><BarChart3 size={18}/> Resumen</a>}
        <span className="nav-title">VENTAS</span>
        {canSee("pos")&&<a className={page === "pos" ? "active" : ""} onClick={()=>setPage("pos")}><ShoppingCart size={18}/> Punto de venta</a>}
        {canSee("sales")&&<a className={page === "sales" ? "active" : ""} onClick={()=>setPage("sales")}><History size={18}/> Historial de ventas</a>}
        {canSee("documents")&&<a className={page === "documents" ? "active" : ""} onClick={()=>setPage("documents")}><Receipt size={18}/> Comprobantes</a>}
        {canSee("budgets")&&<a className={page === "budgets" ? "active" : ""} onClick={()=>setPage("budgets")}><FileText size={18}/> Presupuestos</a>}
        {canSee("sales-notes")&&<a className={page === "sales-notes" ? "active" : ""} onClick={()=>setPage("sales-notes")}><ClipboardList size={18}/> Notas de venta</a>}
        {canSee("reservations")&&<a className={page === "reservations" ? "active" : ""} onClick={()=>setPage("reservations")}><CalendarDays size={18}/> Reservas</a>}{canSee("reserve-funds")&&<a className={page === "reserve-funds" ? "active" : ""} onClick={()=>setPage("reserve-funds")}><BadgeDollarSign size={18}/> Reservas por monto</a>}
        {canSee("orders")&&<a className={page === "orders" ? "active" : ""} onClick={()=>setPage("orders")}><ClipboardList size={18}/> Notas de pedido</a>}
        {canSee("remitos")&&<a className={page === "remitos" ? "active" : ""} onClick={()=>setPage("remitos")}><Truck size={18}/> Remitos</a>}
        <span className="nav-title">GESTIÓN</span>
        {canSee("products")&&<a className={page === "products" ? "active" : ""} onClick={()=>setPage("products")}><PackageSearch size={18}/> Productos</a>}{canSee("categories")&&<a className={page === "categories" ? "active" : ""} onClick={()=>setPage("categories")}><Tags size={18}/> Rubros, subrubros y marcas</a>}{canSee("units")&&<a className={page === "units" ? "active" : ""} onClick={()=>setPage("units")}><Boxes size={18}/> Unidades de medida</a>}{canSee("price-update")&&<a className={page === "price-update" ? "active" : ""} onClick={()=>setPage("price-update")}><Percent size={18}/> Actualización de precios</a>}{canSee("imports")&&<a className={page === "imports" ? "active" : ""} onClick={()=>setPage("imports")}><Download size={18}/> Importar productos</a>}{canSee("shelf-labels")&&<a className={page === "shelf-labels" ? "active" : ""} onClick={()=>setPage("shelf-labels")}><Printer size={18}/> Precios de góndola</a>}
        {canSee("stock")&&<a className={page === "stock" ? "active" : ""} onClick={()=>setPage("stock")}><Warehouse size={18}/> Inventario</a>}
        {canSee("stock-moves")&&<a className={page === "stock-moves" ? "active" : ""} onClick={()=>setPage("stock-moves")}><Boxes size={18}/> Movimientos de stock</a>}{canSee("stock-transfers")&&<a className={page === "stock-transfers" ? "active" : ""} onClick={()=>setPage("stock-transfers")}><RefreshCw size={18}/> Transferencias entre sucursales</a>}{canSee("branch-stock")&&<a className={page === "branch-stock" ? "active" : ""} onClick={()=>setPage("branch-stock")}><Warehouse size={18}/> Stock por sucursal</a>}{canSee("combos")&&<a className={page === "combos" ? "active" : ""} onClick={()=>setPage("combos")}><Boxes size={18}/> Combos</a>}{canSee("quantity-discounts")&&<a className={page === "quantity-discounts" ? "active" : ""} onClick={()=>setPage("quantity-discounts")}><Percent size={18}/> Descuentos por cantidad</a>}{canSee("promotions")&&<a className={page === "promotions" ? "active" : ""} onClick={()=>setPage("promotions")}><Tags size={18}/> Promociones y regalos</a>}{canSee("raffles")&&<a className={page === "raffles" ? "active" : ""} onClick={()=>setPage("raffles")}><Receipt size={18}/> Cupones de sorteo</a>}
        {canSee("clients")&&<a className={page === "clients" ? "active" : ""} onClick={()=>setPage("clients")}><Users size={18}/> Clientes</a>}
        {canSee("suppliers")&&<a className={page === "suppliers" ? "active" : ""} onClick={()=>setPage("suppliers")}><Truck size={18}/> Proveedores</a>}{canSee("purchases")&&<a className={page === "purchases" ? "active" : ""} onClick={()=>setPage("purchases")}><ClipboardList size={18}/> Compras</a>}{canSee("vat-books")&&<a className={page === "vat-books" ? "active" : ""} onClick={()=>setPage("vat-books")}><FileSpreadsheet size={18}/> Libro IVA</a>}{canSee("borrador-iva")&&<a className={page === "borrador-iva" ? "active" : ""} onClick={()=>setPage("borrador-iva")}><FileText size={18}/> Borrador IVA</a>}{canSee("sellers")&&<a className={page === "sellers" ? "active" : ""} onClick={()=>setPage("sellers")}><UserRound size={18}/> Vendedores y comisiones</a>}
        <span className="nav-title">FINANZAS</span>
        {canSee("cash")&&<a className={page === "cash" ? "active" : ""} onClick={()=>setPage("cash")}><CircleDollarSign size={18}/> Caja</a>}
        {canSee("accounts")&&<a className={page === "accounts" ? "active" : ""} onClick={()=>setPage("accounts")}><BadgeDollarSign size={18}/> Cuentas clientes</a>}{session.modulos?.COBRO_TEMPORAL&&<a className={page === "cobro-temporal" ? "active" : ""} onClick={()=>setPage("cobro-temporal")}><CircleDollarSign size={18}/> Cobro temporal</a>}
        {canSee("receipts")&&<a className={page === "receipts" ? "active" : ""} onClick={()=>setPage("receipts")}><Receipt size={18}/> Recibos de cobro</a>}
        {canSee("checks")&&<a className={page === "checks" ? "active" : ""} onClick={()=>setPage("checks")}><FileSpreadsheet size={18}/> Cheques</a>}
        {canSee("cards")&&<a className={page === "cards" ? "active" : ""} onClick={()=>setPage("cards")}><WalletCards size={18}/> Liquidación tarjetas</a>}
        {canSee("bank-list")&&<a className={page === "bank-list" ? "active" : ""} onClick={()=>setPage("bank-list")}><Landmark size={18}/> Bancos</a>}
        {canSee("banks")&&<a className={page === "banks" ? "active" : ""} onClick={()=>setPage("banks")}><Landmark size={18}/> Conciliación bancaria</a>}{canSee("payment-orders")&&<a className={page === "payment-orders" ? "active" : ""} onClick={()=>setPage("payment-orders")}><Receipt size={18}/> Órdenes de pago</a>}{canSee("cash-closures")&&<a className={page === "cash-closures" ? "active" : ""} onClick={()=>setPage("cash-closures")}><CircleDollarSign size={18}/> Cierres de caja</a>}{canSee("currencies")&&<a className={page === "currencies" ? "active" : ""} onClick={()=>setPage("currencies")}><BadgeDollarSign size={18}/> Monedas y cotizaciones</a>}{canSee("check-deposits")&&<a className={page === "check-deposits" ? "active" : ""} onClick={()=>setPage("check-deposits")}><Landmark size={18}/> Depósito de cheques</a>}
        <span className="nav-title">CONFIGURACIÓN</span>
        {canSee("reports")&&<a className={page === "reports" ? "active" : ""} onClick={()=>setPage("reports")}><BarChart3 size={18}/> Reportes</a>}{canSee("dynamic-orders-report")&&<a className={page === "dynamic-orders-report" ? "active" : ""} onClick={()=>setPage("dynamic-orders-report")}><ListTree size={18}/> Pedidos dinámicos</a>}{canSee("sales-reports")&&<a className={page === "sales-reports" ? "active" : ""} onClick={()=>setPage("sales-reports")}><BarChart3 size={18}/> Reportes de ventas</a>}
        {canSee("branches")&&<a className={page === "branches" ? "active" : ""} onClick={()=>setPage("branches")}><Building2 size={18}/> Sucursales</a>}
        {canSee("cashiers")&&<a className={page === "cashiers" ? "active" : ""} onClick={()=>setPage("cashiers")}><UserRound size={18}/> Cajeros</a>}
        {canSee("point-sales")&&<a className={page === "point-sales" ? "active" : ""} onClick={()=>setPage("point-sales")}><Receipt size={18}/> Puntos de venta</a>}{canSee("pos-comprobantes")&&<a className={page === "pos-comprobantes" ? "active" : ""} onClick={()=>setPage("pos-comprobantes")}><Receipt size={18}/> Comprobantes</a>}{canSee("document-designer")&&<a className={page === "document-designer" ? "active" : ""} onClick={()=>setPage("document-designer")}><LayoutTemplate size={18}/> Diseñador de comprobantes</a>}{canSee("company")&&<a className={page === "company" ? "active" : ""} onClick={()=>setPage("company")}><Building size={18}/> Empresa</a>}{canSee("whatsapp-auth")&&<a className={page === "whatsapp-auth" ? "active" : ""} onClick={()=>setPage("whatsapp-auth")}><Phone size={18}/> WhatsApp autorizados</a>}{canSee("whatsapp-orders")&&<a className={page === "whatsapp-orders" ? "active" : ""} onClick={()=>setPage("whatsapp-orders")}><Phone size={18}/> Pedidos por WhatsApp</a>}
        {canSee("settings")&&<a className={page === "settings" ? "active" : ""} onClick={()=>setPage("settings")}><Settings size={18}/> Configuración</a>}
        {canSee("users")&&<a className={page === "users" ? "active" : ""} onClick={()=>setPage("users")}><Users size={18}/> Usuarios</a>}
        {canSee("roles")&&<a className={page === "roles" ? "active" : ""} onClick={()=>setPage("roles")}><ShieldCheck size={18}/> Roles y permisos</a>}
        <span className="nav-title">SISTEMA</span>
        {canSee("novedades")&&<a className={page === "novedades" ? "active" : ""} onClick={()=>setPage("novedades")}><Sparkles size={18}/> Novedades</a>}{canSee("whatsapp-tray")&&<a className={page === "whatsapp-tray" ? "active" : ""} onClick={()=>setPage("whatsapp-tray")}><Phone size={18}/> Bandeja WhatsApp</a>}{canSee("whatsapp-tray")&&<a className={page === "whatsapp-chat-demo" ? "active" : ""} onClick={()=>setPage("whatsapp-chat-demo")}><MessageCircle size={18}/> Asistente WhatsApp</a>}{canSee("whatsapp-tray")&&<a className={page === "whatsapp-empleado" ? "active" : ""} onClick={()=>setPage("whatsapp-empleado")}><MessageSquareText size={18}/> Asistente Empleados</a>}
      </nav>
      <div className="user-card"><div className="avatar">{session.usuario?.nombre?.[0] || "A"}</div><div><strong>{session.usuario?.nombre}</strong><span>{session.empresa?.nombre}</span></div><button onClick={logout}><LogOut size={16}/></button></div>
      {appInfo && (() => {
        const l = appInfo.licencia;
        const dias = l && l.fechaVencimiento ? Math.ceil((new Date(l.fechaVencimiento + 'T23:59:59').getTime() - Date.now()) / 86400000) : null;
        const vencida = l && l.fechaVencimiento ? dias !== null && dias < 0 : false;
        const proxima = l && l.fechaVencimiento ? dias !== null && dias >= 0 && dias <= 30 : false;
        const fmt = (s: string) => { try { return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-AR'); } catch { return s; } };
        return <div className={`sidebar-appinfo ${appInfo.actualizado ? 'ok' : 'update'}`}>
          <div className="sai-line">{appInfo.actualizado ? <><span className="badge success">Actualizado</span><span>v{appInfo.version}</span></> : <><span className="badge warning">Actualización v{appInfo.version}</span><span>Tenés v{appInfo.versionInstalada}. {appInfo.licencia?.actualizacionesIncluidas ? 'Incluida en tu licencia.' : 'Renová la licencia.'}</span></>}</div>
          <div className="sai-line">{!l ? <span className="badge danger">Sin licencia activa</span> : l.definitiva ? <><span className="badge success">Licencia definitiva</span><span>No vence.</span></> : vencida ? <><span className="badge danger">Licencia vencida</span><span>Venció el {fmt(l.fechaVencimiento)}.</span></> : proxima ? <><span className="badge warning">Licencia {l.plan}</span><span>Vence el {fmt(l.fechaVencimiento)} ({dias} día{dias === 1 ? '' : 's'}).</span></> : <><span className="badge">Licencia {l.plan}</span><span>Vence el {fmt(l.fechaVencimiento)}.</span></>}</div>
          <button className="chg-link" onClick={() => setPage("novedades")}>Ver novedades</button>
        </div>;
      })()}
    </aside>

    <section className="workspace">
      <header><div><button className="mobile-menu" onClick={() => setMenuAbierto(v => !v)}><Menu/></button><h2>{pageTitle(page)}</h2><p>{pageSubtitle(page)}</p></div><div className="header-actions">{page==='pos'&&<button className="fullscreen-action" onClick={()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}><Maximize2 size={16}/> Pantalla completa</button>}<div className="status"><i/> Backend conectado</div></div></header>
      {page==='point-sales'&&<PointPrintSettings/>}
      {page === "cobro-temporal" ? <CobroTemporalPage/> : page === "novedades" ? <ChangelogPage/> : page === "whatsapp-tray" ? <WhatsappTrayPage/> : page === "whatsapp-chat-demo" ? <WhatsappChatDemoPage/> : page === "whatsapp-empleado" ? <WhatsappEmpleadoDemoPage/> : page === "dashboard" ? <DashboardPage onNavigate={setPage}/> : page === "products" ? <ProductsPage/> : page === "pos" ? <AdvancedPosPage pantallas={session.pantallas ?? null} onSendToAssistant={(text)=>{ empleadoEncolarMensaje(text); setPage("whatsapp-empleado"); }}/> : page === "clients" ? <ClientsPage/> : page === "suppliers" ? <SuppliersPage/> : page === "checks" ? <ChecksPage/> : page === "sales-notes" ? <OperationalDocumentsPage tipo="NOTA DE VENTA X" onNavigate={setPage}/> : page === "reservations" ? <OperationalDocumentsPage tipo="RESERVA" onNavigate={setPage}/> : page === "orders" ? <OperationalDocumentsPage tipo="NOTA DE PEDIDO" onNavigate={setPage}/> : page === "remitos" ? <OperationalDocumentsPage tipo="REMITO" onNavigate={setPage}/> : page === "categories" ? <CatalogsPage/> : page === "units" ? <UnitsPage/> : page === "price-update" ? <PriceUpdatePage/> : page === "imports" ? <ImportProductsPage/> : page === "shelf-labels" ? <ShelfLabelsPage/> : page === "sellers" ? <SellersPage/> : page === "reports" ? <ReportsPage/> : page === "sales-reports" ? <SalesReportsPage onNavigate={setPage}/> : page === "point-sales" ? <PointOfSalesPage/> : page === "pos-comprobantes" ? <PosComprobantesConfigPage/> : page === "reserve-funds" ? <ReserveFundsPage/> : page === "dynamic-orders-report" ? <DynamicOrdersReportPage/> : page === "document-designer" ? <DocumentDesignerPage/> : page === "company" ? <CompanyPage/> : page === "whatsapp-auth" ? <WhatsappAuthorizedPage/> : page === "whatsapp-orders" ? <WhatsappOrdersPage/> : page === "cards" ? <CardsPage/> : page === "bank-list" ? <BanksPage/> : page === "banks" ? <BankReconciliationPage/> : page === "payment-orders" ? <Beta2PaymentOrdersPage/> : page === "cash-closures" ? <CashClosuresPage/> : page === "currencies" ? <CurrenciesPage/> : page === "branches" ? <SimpleCrudPage kind="SUCURSALES"/> : page === "cashiers" ? <SimpleCrudPage kind="CAJEROS"/> : page === "stock-transfers" ? <StockTransfersPage/> : page === "branch-stock" ? <BranchStockPage/> : page === "combos" ? <CommercialRulesPage kind="COMBOS"/> : page === "quantity-discounts" ? <CommercialRulesPage kind="DESCUENTOS"/> : page === "promotions" ? <CommercialRulesPage kind="PROMOCIONES"/> : page === "raffles" ? <CommercialRulesPage kind="SORTEOS"/> : page === "purchases" ? <PurchasesPage/> : page === "vat-books" ? <VatBooksPage/> : page === "borrador-iva" ? <BorradorIvaPage/> : page === "product-suppliers" ? <ProductSuppliersPage/> : page === "check-deposits" ? <Beta2CheckDepositsPage/> : page === "stock" ? <StockPage/> : page === "stock-moves" ? <StockMovementsPage/> : page === "sales" ? <SalesHistoryPage/> : page === "documents" ? <DocumentsPage/> : page === "budgets" ? <DocumentsPage tipo="PRESUPUESTO"/> : page === "accounts" ? <ClientAccountsPage/> : page === "receipts" ? <ReceiptsPage/> : page === "cash" ? <CashPage onNavigate={setPage}/> : page === "settings" ? <SettingsPage/> : page === "users" ? <UsersPage/> : page === "roles" ? <RolesPermissionsPage/> : page !== "chat" ? <ModulePreview page={page}/> : <div className="content-grid">
        <section className="chat-panel">
          <div className="chat-head"><div className="bot-avatar"><Bot/></div><div><strong>Asistente Comercial</strong><span><i/> En línea</span></div><button onClick={newConversation} title="Reiniciar"><RefreshCw size={18}/></button></div>
          <div className="messages">
            {messages.length === 0 && <div className="welcome">
              <div className="welcome-icon"><Sparkles/></div><h3>¿Qué operación querés realizar?</h3>
              <p>Podés pedirme un presupuesto, factura, remito o nota de pedido.</p>
              <div className="examples">{examples.map(x => <button key={x} onClick={()=>send(x)}>{x}<ChevronRight size={15}/></button>)}</div>
            </div>}
            {messages.map(m => <div key={m.id} className={`message-row ${m.role}`}>
              {m.role === "assistant" && <div className="message-avatar"><Bot size={16}/></div>}
              <div className="bubble"><p>{m.text}</p>
                {m.response?.options?.length > 0 && <div className="option-list product-choice-list">{m.response.options.map((o:any, i:number)=><button key={i} onClick={()=>send(String(i+1))}><span><b>{i+1}. {o.razon_social || o.nombre || o.descripcion || o.codigo}</b>{(o.codigo || o.codigo_barra || o.codigoBarra) && <small>Código: {o.codigo || o.codigo_barra || o.codigoBarra}</small>}</span>{o.precio != null && <strong>$ {Number(o.precio).toLocaleString("es-AR",{minimumFractionDigits:2})}</strong>}</button>)}</div>}
                {m.response?.actions?.length > 0 && <div className="option-list inline-actions">{m.response.actions.map((a:string)=><button key={a} onClick={()=>send(actionText(a))}>{actionLabel(a)}</button>)}</div>}
                <time>{m.at.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</time>
              </div>
            </div>)}
            {loading && <div className="message-row assistant"><div className="message-avatar"><Bot size={16}/></div><div className="bubble typing"><i/><i/><i/></div></div>}
            <div ref={bottomRef}/>
          </div>
          <div className="composer">
            <div className="quick-actions"><button onClick={()=>send("confirmar")}><Check size={15}/> Confirmar</button><button onClick={()=>send("cancelar")}><X size={15}/> Cancelar</button></div>
            <div className="composer-box"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Escribí una operación comercial..."/><button onClick={()=>send()} disabled={!input.trim()||loading}><Send size={19}/></button></div>
            <small>Enter para enviar · Shift + Enter para nueva línea</small>
          </div>
        </section>

        <aside className="operation-panel">
          <div className="operation-title"><div><span>OPERACIÓN ACTUAL</span><h3>{command.operation || command.operationType || command.documentType || "Sin operación"}</h3></div><b className={`state ${activeResponse?.conversation?.estado ? "active" : ""}`}>{activeResponse?.conversation?.estado || "ESPERANDO"}</b></div>
          {!activeResponse ? <div className="empty-operation"><FileText/><h4>Sin datos todavía</h4><p>La información aparecerá mientras conversás.</p></div> : <>
            <Info icon={<UserRound/>} label="Cliente" value={command.customer?.name || command.customerText || command.cliente || "Pendiente"}/>
            <Info icon={<FileText/>} label="Documento" value={command.documentType || command.operation || "Pendiente"}/>
            <Info icon={<Phone/>} label="Canal" value="Web conversacional"/>
            <div className="items-card"><div className="section-label">PRODUCTOS</div>{items.length ? items.map((it:any,i:number)=><div className="item" key={i}><div><strong>{it.description || it.descripcion || it.productText || "Producto"}</strong><span>{it.quantity || it.cantidad || 1} unidad/es</span></div><b>{it.price ? `$ ${Number(it.price).toLocaleString("es-AR")}` : "A resolver"}</b></div>) : <p className="pending">Todavía no hay productos resueltos.</p>}</div>
            <div className="summary-card"><div><span>Estado de validación</span><strong>{activeResponse.validation?.valid === false ? "Faltan datos" : "En proceso"}</strong></div>{total && <div className="total"><span>Total</span><strong>$ {Number(total).toLocaleString("es-AR")}</strong></div>}</div>
            <div className="security-note"><ShieldCheck/><div><strong>Operación controlada</strong><span>Ningún documento se genera sin confirmación.</span></div></div>
          </>}
        </aside>
      </div>}
    </section>
    <WhatsappBell onNavigate={setPage} />
  </div>
}
