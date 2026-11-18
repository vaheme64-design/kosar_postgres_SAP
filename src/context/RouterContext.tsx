import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { TabKey, MachineSubTabKey } from '../components/Sidebar';
import { InventorySubTab } from '../components/inventory/InventoryModuleView';
import { ProductionWorkbenchSubTab } from '../components/production/ErpProductionWorkbenchView';
import { PlanningSubTabKey } from '../components/planning/ProductionPlanningModuleView';
import { DrawerTabKey } from '../components/workflow/OrderDetailsDrawer';
import { MasterSubSection } from '../components/MasterDataHubView';

export type ErpModalType = 'create-mo' | 'wip-check' | 'edit-mo' | 'timeline' | 'log-step' | null;
export type WipSubTabKey = 'UNIFIED_DIRECTORY' | 'BOTTLENECK' | 'TRACEABILITY' | 'DASHBOARD' | 'ORDERS' | 'TRANSFERS' | 'STAGES';

export interface RouteState {
  tab: TabKey;
  productionViewMode: 'ERP_WORKBENCH' | 'VOUCHERS';
  productionModuleTab: ProductionWorkbenchSubTab;
  inventorySubTab: InventorySubTab;
  planningSubTab: PlanningSubTabKey;
  machineSubTab: MachineSubTabKey;
  wipSubTab?: WipSubTabKey;
  contractsSubTab?: 'CONTRACTS_QUOTAS' | 'CUSTOMER_ORDERS';
  masterSubSection?: MasterSubSection;
  settingsSubTab?: 'rbac' | 'db_architecture';
  reportSubTab?: string;
  moId: string | null;
  drawerTab: DrawerTabKey | null;
  timelineMoId: string | null;
  docQuery?: string | null;
  modal: ErpModalType;
  modalOrderId?: string | null;
  modalPartId?: string | null;
}

export interface RouteNavigateParams {
  tab?: TabKey;
  productionViewMode?: 'ERP_WORKBENCH' | 'VOUCHERS';
  productionModuleTab?: ProductionWorkbenchSubTab;
  inventorySubTab?: InventorySubTab;
  planningSubTab?: PlanningSubTabKey;
  machineSubTab?: MachineSubTabKey;
  wipSubTab?: WipSubTabKey;
  contractsSubTab?: 'CONTRACTS_QUOTAS' | 'CUSTOMER_ORDERS';
  masterSubSection?: MasterSubSection;
  settingsSubTab?: 'rbac' | 'db_architecture';
  reportSubTab?: string;
  moId?: string | null;
  drawerTab?: DrawerTabKey | null;
  timelineMoId?: string | null;
  docQuery?: string | null;
  modal?: ErpModalType;
  modalOrderId?: string | null;
  modalPartId?: string | null;
}

export interface HistorySnapshotEntry {
  id: string;
  key: string;
  route: RouteState;
  label: string;
  localKey?: string;
  selectionRestore?: () => void;
}

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface RouterContextType {
  route: RouteState;
  navigate: (params: RouteNavigateParams, options?: { replace?: boolean }) => void;
  goBack: () => void;
  pushSelectionStep: (label: string, onRestorePrevious: () => void, localKey?: string) => void;
  canGoBack: boolean;
  previousEntryLabel: string;
  currentRouteLabel: string;
  historyDepth: number;
  breadcrumbs: BreadcrumbItem[];
  openCreateMoModal: (partId?: string) => void;
  openWipCheckModal: (orderId?: string, partId?: string) => void;
  closeModal: () => void;
  openMoDrawer: (moId: string, drawerTab?: DrawerTabKey) => void;
  closeMoDrawer: () => void;
  openTimeline: (moId: string) => void;
  closeTimeline: () => void;
  setProductionSubTab: (subTab: ProductionWorkbenchSubTab) => void;
  traceDocument: (query: string, target?: 'INVENTORY_LEDGER' | 'WIP_TRACEABILITY' | 'COILS' | 'CONTRACTS') => void;
  clearDocQuery: () => void;
  buildShareableUrl: (params?: RouteNavigateParams) => string;
}

const DEFAULT_ROUTE: RouteState = {
  tab: 'dashboard',
  productionViewMode: 'ERP_WORKBENCH',
  productionModuleTab: 'MULTI_PART_SCHEDULER',
  inventorySubTab: 'DASHBOARD',
  planningSubTab: 'erp_workbench',
  machineSubTab: 'machines',
  wipSubTab: 'UNIFIED_DIRECTORY',
  contractsSubTab: 'CONTRACTS_QUOTAS',
  masterSubSection: 'PARTS',
  settingsSubTab: 'rbac',
  reportSubTab: 'plan_vs_actual',
  moId: null,
  drawerTab: null,
  timelineMoId: null,
  docQuery: null,
  modal: null,
  modalOrderId: null,
  modalPartId: null,
};

const RouterContext = createContext<RouterContextType | null>(null);

// Production SubTab slug mapping for clean URLs like /#/production/matrix or /#/production/wip
const PROD_SLUG_TO_SUBTAB: Record<string, ProductionWorkbenchSubTab> = {
  matrix: 'MULTI_PART_SCHEDULER',
  scheduler: 'MULTI_PART_SCHEDULER',
  ops: 'MULTI_PART_SCHEDULER',
  dispatch: 'DAILY_DISPATCH_SHEET',
  daily: 'DAILY_DISPATCH_SHEET',
  wip: 'LIVE_WIP_OP_TRACKER',
  tracker: 'LIVE_WIP_OP_TRACKER',
  oee: 'KPI_OEE_REPORTS',
  reports: 'KPI_OEE_REPORTS',
  projections: 'MATERIAL_REQUIREMENT_PROJECTION',
  mrp: 'MATERIAL_REQUIREMENT_PROJECTION',
  timeline: 'TREE_TIMELINE_REPORT',
  workflow: 'SAP_PP_WORKFLOW',
};

const PROD_SUBTAB_TO_SLUG: Record<ProductionWorkbenchSubTab, string> = {
  MULTI_PART_SCHEDULER: 'matrix',
  DAILY_DISPATCH_SHEET: 'dispatch',
  LIVE_WIP_OP_TRACKER: 'wip',
  KPI_OEE_REPORTS: 'oee',
  MATERIAL_REQUIREMENT_PROJECTION: 'projections',
  TREE_TIMELINE_REPORT: 'timeline',
  SAP_PP_WORKFLOW: 'workflow',
};

// Inventory SubTab slug mapping
const INV_SLUG_TO_SUBTAB: Record<string, InventorySubTab> = {
  dashboard: 'DASHBOARD',
  inquiry: 'INQUIRY',
  stock: 'INQUIRY',
  movement: 'MOVEMENT',
  vouchers: 'MOVEMENT',
  coils: 'COILS',
  sapco: 'SAPCO',
  alerts: 'ALERTS',
  contracts: 'CONTRACTS',
  reports: 'CUSTOM_REPORTS',
  custom_reports: 'CUSTOM_REPORTS',
  import_export: 'IMPORT_EXPORT',
  stages: 'STAGES',
  quality_qm: 'QUALITY_QM',
  qm: 'QUALITY_QM',
};

const INV_SUBTAB_TO_SLUG: Record<InventorySubTab, string> = {
  DASHBOARD: 'dashboard',
  INQUIRY: 'inquiry',
  MOVEMENT: 'movement',
  COILS: 'coils',
  ALERTS: 'alerts',
  CONTRACTS: 'contracts',
  CUSTOM_REPORTS: 'reports',
  IMPORT_EXPORT: 'import_export',
  SAPCO: 'sapco',
  STAGES: 'stages',
  QUALITY_QM: 'quality_qm',
};

// Planning SubTab slug mapping
const PLAN_SLUG_TO_SUBTAB: Record<string, PlanningSubTabKey> = {
  workbench: 'erp_workbench',
  mrp: 'mrp',
  capacity: 'capacity_planning',
  schedule: 'daily_schedule',
  orders: 'orders',
  approved: 'approved_plans',
  consumables: 'consumables',
  recommendations: 'recommendations',
  dashboard: 'dashboard',
  workflow: 'workflow_doc',
};

const PLAN_SUBTAB_TO_SLUG: Record<PlanningSubTabKey, string> = {
  erp_workbench: 'workbench',
  mrp: 'mrp',
  capacity_planning: 'capacity',
  daily_schedule: 'schedule',
  orders: 'orders',
  approved_plans: 'approved',
  consumables: 'consumables',
  recommendations: 'recommendations',
  dashboard: 'dashboard',
  workflow_doc: 'workflow',
};

function parseUrlToRoute(): RouteState {
  if (typeof window === 'undefined') return DEFAULT_ROUTE;

  const hash = window.location.hash || '';
  const hashPathAndSearch = hash.replace(/^#\/?/, '');
  const [hashPath = '', hashSearch = ''] = hashPathAndSearch.split('?');

  const searchParams = new URLSearchParams(hashSearch || window.location.search);
  const pathSegments = hashPath.split('/').filter(Boolean);
  const primaryPath = (pathSegments[0] || window.location.pathname.replace(/^\//, '')).split('/')[0].toLowerCase();
  const secondaryPath = (pathSegments[1] || '').toLowerCase();

  const VALID_TABS: Record<string, TabKey> = {
    dashboard: 'dashboard',
    workbench: 'dashboard',
    master_data: 'master_data',
    parts: 'master_data',
    contracts: 'contracts',
    sales: 'contracts',
    inventory: 'inventory',
    stock: 'inventory',
    production: 'production',
    manufacturing: 'production',
    wip: 'wip',
    planning: 'planning',
    mrp: 'planning',
    machines: 'machines',
    equipment: 'machines',
    sapco: 'sapco',
    coils: 'sapco',
    reports: 'reports',
    oee: 'reports',
    settings: 'settings',
    users: 'settings',
  };

  let tab: TabKey = VALID_TABS[primaryPath] || (searchParams.get('module') && VALID_TABS[searchParams.get('module')!]) || 'dashboard';

  // Sub-tabs & parameters
  const rawProdViewMode = searchParams.get('viewMode') || searchParams.get('mode');
  const productionViewMode: 'ERP_WORKBENCH' | 'VOUCHERS' =
    rawProdViewMode === 'VOUCHERS' ? 'VOUCHERS' : 'ERP_WORKBENCH';

  // Determine production module tab from subpath (e.g. /#/production/matrix or /#/production/wip) or search param
  let productionModuleTab: ProductionWorkbenchSubTab = 'MULTI_PART_SCHEDULER';
  if (tab === 'production' && secondaryPath && PROD_SLUG_TO_SUBTAB[secondaryPath]) {
    productionModuleTab = PROD_SLUG_TO_SUBTAB[secondaryPath];
  } else if (searchParams.get('tab') && PROD_SLUG_TO_SUBTAB[searchParams.get('tab')!]) {
    productionModuleTab = PROD_SLUG_TO_SUBTAB[searchParams.get('tab')!];
  } else if (searchParams.get('prodTab')) {
    const raw = searchParams.get('prodTab') as ProductionWorkbenchSubTab;
    if (Object.values(PROD_SLUG_TO_SUBTAB).includes(raw)) {
      productionModuleTab = raw;
    }
  }

  // Determine inventory subtab from subpath (e.g. /#/inventory/inquiry) or search param
  let inventorySubTab: InventorySubTab = 'DASHBOARD';
  if (tab === 'inventory' && secondaryPath && INV_SLUG_TO_SUBTAB[secondaryPath]) {
    inventorySubTab = INV_SLUG_TO_SUBTAB[secondaryPath];
  } else if (searchParams.get('subTab') && INV_SLUG_TO_SUBTAB[searchParams.get('subTab')!]) {
    inventorySubTab = INV_SLUG_TO_SUBTAB[searchParams.get('subTab')!];
  }

  // Determine planning subtab from subpath (e.g. /#/planning/mrp) or search param
  let planningSubTab: PlanningSubTabKey = 'erp_workbench';
  if (tab === 'planning' && secondaryPath && PLAN_SLUG_TO_SUBTAB[secondaryPath]) {
    planningSubTab = PLAN_SLUG_TO_SUBTAB[secondaryPath];
  } else if (searchParams.get('subTab') && PLAN_SLUG_TO_SUBTAB[searchParams.get('subTab')!]) {
    planningSubTab = PLAN_SLUG_TO_SUBTAB[searchParams.get('subTab')!];
  }

  const rawMachineSubTab = searchParams.get('mchTab') || searchParams.get('subTab');
  const validMachineSubTabs: MachineSubTabKey[] = [
    'machines',
    'maintenance',
    'oee',
    'utilization',
    'dies',
    'halls',
    'operators',
  ];
  const machineSubTab: MachineSubTabKey = validMachineSubTabs.includes(rawMachineSubTab as any)
    ? (rawMachineSubTab as MachineSubTabKey)
    : 'machines';

  const moId = searchParams.get('mo') || searchParams.get('orderId') || null;
  const rawDrawerTab = searchParams.get('drawerTab');
  const validDrawerTabs: DrawerTabKey[] = ['TRACEABILITY', 'ROUTING', 'ACTIONS', 'AUDIT_TRAIL', 'WIP_INSPECTION'];
  const drawerTab: DrawerTabKey | null = validDrawerTabs.includes(rawDrawerTab as any)
    ? (rawDrawerTab as DrawerTabKey)
    : moId
    ? 'TRACEABILITY'
    : null;

  const timelineMoId = searchParams.get('timeline') || searchParams.get('timelineMo') || null;

  // Modal Parameter (e.g. ?modal=create-mo or ?modal=wip-check)
  const rawModal = searchParams.get('modal');
  let modal: ErpModalType = null;
  if (rawModal === 'create-mo' || rawModal === 'wip-check' || rawModal === 'edit-mo' || rawModal === 'timeline' || rawModal === 'log-step') {
    modal = rawModal as ErpModalType;
  }

  const modalOrderId = searchParams.get('orderId') || searchParams.get('mo') || null;
  const modalPartId = searchParams.get('partId') || null;

  const rawMasterSubSection = searchParams.get('masterSubSection') || searchParams.get('section');
  const masterSubSection: MasterSubSection = (rawMasterSubSection as MasterSubSection) || 'PARTS';
  const docQuery = searchParams.get('doc') || searchParams.get('q') || null;
  const rawWipSubTab = searchParams.get('wipTab') as WipSubTabKey | null;
  const wipSubTab: WipSubTabKey = rawWipSubTab || 'UNIFIED_DIRECTORY';
  const rawContractsSubTab = searchParams.get('contractsTab');
  const contractsSubTab: 'CONTRACTS_QUOTAS' | 'CUSTOMER_ORDERS' =
    rawContractsSubTab === 'CUSTOMER_ORDERS' ? 'CUSTOMER_ORDERS' : 'CONTRACTS_QUOTAS';
  const rawSettingsSubTab = searchParams.get('settingsTab');
  const settingsSubTab: 'rbac' | 'db_architecture' = rawSettingsSubTab === 'db_architecture' ? 'db_architecture' : 'rbac';
  const reportSubTab = searchParams.get('reportTab') || 'plan_vs_actual';

  return {
    tab,
    productionViewMode,
    productionModuleTab,
    inventorySubTab,
    planningSubTab,
    machineSubTab,
    wipSubTab,
    contractsSubTab,
    masterSubSection,
    settingsSubTab,
    reportSubTab,
    moId,
    drawerTab,
    timelineMoId,
    docQuery,
    modal,
    modalOrderId,
    modalPartId,
  };
}

function serializeRouteToHash(state: RouteState): string {
  let basePath = `#/${state.tab}`;

  if (state.tab === 'production') {
    const slug = PROD_SUBTAB_TO_SLUG[state.productionModuleTab] || 'matrix';
    basePath = `#/production/${slug}`;
  } else if (state.tab === 'inventory') {
    const slug = INV_SUBTAB_TO_SLUG[state.inventorySubTab] || 'dashboard';
    basePath = `#/inventory/${slug}`;
  } else if (state.tab === 'planning') {
    const slug = PLAN_SUBTAB_TO_SLUG[state.planningSubTab] || 'workbench';
    basePath = `#/planning/${slug}`;
  }

  const params = new URLSearchParams();

  if (state.tab === 'production' && state.productionViewMode !== 'ERP_WORKBENCH') {
    params.set('viewMode', state.productionViewMode);
  }

  if (state.modal) {
    params.set('modal', state.modal);
    if (state.modalOrderId) {
      params.set('orderId', state.modalOrderId);
    }
    if (state.modalPartId) {
      params.set('partId', state.modalPartId);
    }
  }

  if (state.moId) {
    params.set('mo', state.moId);
    if (state.drawerTab && state.drawerTab !== 'TRACEABILITY') {
      params.set('drawerTab', state.drawerTab);
    }
  }

  if (state.tab === 'master_data' && state.masterSubSection && state.masterSubSection !== 'PARTS') {
    params.set('section', state.masterSubSection);
  }

  if (state.timelineMoId) {
    params.set('timeline', state.timelineMoId);
  }

  if (state.docQuery) {
    params.set('doc', state.docQuery);
  }

  if (state.tab === 'wip' && state.wipSubTab && state.wipSubTab !== 'UNIFIED_DIRECTORY') {
    params.set('wipTab', state.wipSubTab);
  }

  if (state.tab === 'contracts' && state.contractsSubTab && state.contractsSubTab !== 'CONTRACTS_QUOTAS') {
    params.set('contractsTab', state.contractsSubTab);
  }

  if (state.tab === 'settings' && state.settingsSubTab && state.settingsSubTab !== 'rbac') {
    params.set('settingsTab', state.settingsSubTab);
  }

  if (state.tab === 'reports' && state.reportSubTab && state.reportSubTab !== 'plan_vs_actual') {
    params.set('reportTab', state.reportSubTab);
  }

  const queryString = params.toString();
  return `${basePath}${queryString ? `?${queryString}` : ''}`;
}

const TAB_LABELS: Record<TabKey, string> = {
  dashboard: 'صفحه اصلی (لانچ‌پد SAP Fiori)',
  master_data: 'اطلاعات پایه و درخت محصول',
  contracts: 'قراردادها و سفارشات مشتری (SD)',
  inventory: 'انبار، کالا و کنترل کیفیت (MM/QM)',
  production: 'میز کار و دستورات تولید (PP)',
  wip: 'جریان قطعات در ساخت (WIP)',
  planning: 'برنامه‌ریزی تولید و MRP',
  machines: 'ماشین‌آلات، قالب‌ها و نت',
  sapco: 'رول‌ها و مواد امانی ساپکو',
  reports: 'گزارش‌های تحلیلی و OEE',
  settings: 'تنظیمات سیستم و پایگاه داده',
};

const MASTER_SUB_LABELS: Record<string, string> = {
  HUB: 'میز کار اطلاعات پایه',
  PARTS: 'کاتالوگ قطعات و مواد',
  ROUTINGS: 'مسیرهای تولید (Routings)',
  BOM: 'درخت محصول چندسطحی (BOM)',
  PRODUCT_STRUCTURE: 'ساختار محصول (Product Structure)',
  OPERATIONS: 'عملیات و استانداردهای خط',
  PARALLEL_FLOW: 'جریان‌های تولید موازی',
  MACHINES: 'ماشین‌آلات و ایستگاه‌ها',
  DIES: 'قالب‌ها و فیکسچرها',
  OPERATORS: 'اپراتورهای تولید',
  HALLS: 'سالن‌های تولید',
  SUPPLIERS: 'تامین‌کنندگان',
  WORKFLOW_MAP: 'نقشه مهندسی ساخت',
  SCENARIO_WIZARD: 'شبیه‌ساز سناریوی تولید و MRP',
};

const WIP_SUB_LABELS: Record<string, string> = {
  UNIFIED_DIRECTORY: 'میز کار یکپارچه کارگاه و WIP',
  BOTTLENECK: 'تحلیل گلوگاه‌های تولید',
  TRACEABILITY: 'رهگیری سری ساخت و کلاف',
  DASHBOARD: 'داشبورد شاخص‌های WIP',
  ORDERS: 'کارت دستورات تولید (MO)',
  TRANSFERS: 'حواله‌های بین‌ایستگاهی WIP',
  STAGES: 'ایستگاه‌ها و موجودی پای کار',
};

const INV_SUB_LABELS: Record<string, string> = {
  DASHBOARD: 'داشبورد موجودی انبار',
  INQUIRY: 'موجودی لحظه‌ای و کاردکس (Stock Inquiry)',
  MOVEMENT: 'اسناد و حواله‌های انبار (MIGO)',
  COILS: 'مدیریت رول‌ها و کلاف‌های فیزیکی',
  ALERTS: 'هشدارهای نقطه سفارش (ROP)',
  CONTRACTS: 'انبار امانی قراردادها',
  CUSTOM_REPORTS: 'گزارش‌ساز انبار',
  IMPORT_EXPORT: 'مرکز ورود و خروج اکسل',
  SAPCO: 'مواد امانی ساپکو',
  STAGES: 'موجودی مراحل تولید',
  QUALITY_QM: 'کنترل کیفیت و قرنطینه (QM)',
};

const PROD_SUB_LABELS: Record<string, string> = {
  MULTI_PART_SCHEDULER: 'برنامه‌ریزی و زمان‌بندی چندقطعه',
  DAILY_DISPATCH_SHEET: 'برگه اعزام روزانه خط تولید',
  LIVE_WIP_OP_TRACKER: 'ردیابی زنده عملیات WIP',
  KPI_OEE_REPORTS: 'گزارش‌های OEE و بهره‌وری',
  MATERIAL_REQUIREMENT_PROJECTION: 'پیش‌بینی مصرف مواد اولیه',
  TREE_TIMELINE_REPORT: 'تایم‌لاین درختی ساخت',
  SAP_PP_WORKFLOW: 'نقشه گردش کار SAP PP',
};

const PLAN_SUB_LABELS: Record<string, string> = {
  erp_workbench: 'میز کار برنامه‌ریزی',
  mrp: 'موتور نیازسنجی مواد (MRP)',
  capacity_planning: 'توازن ظرفیت ماشین‌آلات',
  daily_schedule: 'برنامه شیفت و خط روزانه',
  orders: 'سفارشات مشتری و تعهدات',
  approved_plans: 'برنامه‌های تاییدشده تولید',
  consumables: 'مصرف‌شدنی‌ها و ابزارها',
  recommendations: 'پیشنهادات و دستورات ساخت (MRP)',
  dashboard: 'داشبورد شاخص‌های برنامه‌ریزی',
  workflow_doc: 'مستندات فرآیند برنامه‌ریزی',
};

export function formatRouteLabel(state: RouteState): string {
  const tabLabel = TAB_LABELS[state.tab] || 'صفحه فعلی';
  if (state.moId) return `${tabLabel} ← پرونده دستور ${state.moId}`;
  if (state.timelineMoId) return `${tabLabel} ← تایم‌لاین ${state.timelineMoId}`;
  if (state.tab === 'master_data' && state.masterSubSection) {
    return `${MASTER_SUB_LABELS[state.masterSubSection] || tabLabel}`;
  }
  if (state.tab === 'wip' && state.wipSubTab) {
    return `${WIP_SUB_LABELS[state.wipSubTab] || tabLabel}`;
  }
  if (state.tab === 'inventory') {
    return `${INV_SUB_LABELS[state.inventorySubTab] || tabLabel}`;
  }
  if (state.tab === 'production') {
    if (state.productionViewMode === 'VOUCHERS') return 'ثبت قبض تکی کارگاه (MIGO)';
    return `${PROD_SUB_LABELS[state.productionModuleTab] || tabLabel}`;
  }
  if (state.tab === 'planning') {
    return `${PLAN_SUB_LABELS[state.planningSubTab] || tabLabel}`;
  }
  if (state.tab === 'contracts' && state.contractsSubTab === 'CUSTOMER_ORDERS') {
    return 'سفارشات تحویل به مشتری';
  }
  if (state.tab === 'settings') {
    return state.settingsSubTab === 'db_architecture'
      ? 'تنظیمات دو پایگاه داده و همگام‌سازی'
      : 'کاربران و سطوح دسترسی (RBAC)';
  }
  return tabLabel;
}

export const ErpRouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteState>(parseUrlToRoute);
  const [historyStack, setHistoryStack] = useState<HistorySnapshotEntry[]>([]);
  const [activeLocalLabel, setActiveLocalLabel] = useState<string | null>(null);

  // Sync state whenever hash or popstate changes (Browser Back / Forward button support)
  useEffect(() => {
    const handleLocationChange = () => {
      const parsed = parseUrlToRoute();
      setRoute(parsed);
      setActiveLocalLabel(null);
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    // Initial normalize if URL is bare
    if (typeof window !== 'undefined' && !window.location.hash) {
      const initialHash = serializeRouteToHash(route);
      window.history.replaceState(null, '', initialHash);
    }

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigate = useCallback((params: RouteNavigateParams, options?: { replace?: boolean }) => {
    setActiveLocalLabel(null);
    setRoute(prev => {
      const next: RouteState = {
        ...prev,
        ...params,
        productionViewMode:
          params.productionViewMode !== undefined
            ? params.productionViewMode
            : params.productionModuleTab
            ? 'ERP_WORKBENCH'
            : prev.productionViewMode,
        moId: params.moId !== undefined ? params.moId : params.tab && params.tab !== prev.tab ? null : prev.moId,
        drawerTab: params.drawerTab !== undefined ? params.drawerTab : params.moId ? 'TRACEABILITY' : prev.drawerTab,
        modal: params.modal !== undefined ? params.modal : prev.modal,
        modalOrderId: params.modalOrderId !== undefined ? params.modalOrderId : prev.modalOrderId,
        modalPartId: params.modalPartId !== undefined ? params.modalPartId : prev.modalPartId,
      };

      const prevKey = serializeRouteToHash(prev);
      const nextKey = serializeRouteToHash(next);

      if (!options?.replace && nextKey !== prevKey) {
        setHistoryStack(stack => {
          const entry: HistorySnapshotEntry = {
            id: `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            key: prevKey,
            route: prev,
            label: formatRouteLabel(prev),
          };
          const top = stack[stack.length - 1];
          if (top && top.key === entry.key && !top.selectionRestore) {
            return stack;
          }
          return [...stack.slice(-39), entry];
        });
      }

      if (typeof window !== 'undefined') {
        if (options?.replace) {
          window.history.replaceState(null, '', nextKey);
        } else if (nextKey !== prevKey) {
          window.history.pushState(null, '', nextKey);
        }
      }

      return next;
    });
  }, []);

  const pushSelectionStep = useCallback(
    (label: string, onRestorePrevious: () => void, localKey?: string) => {
      const currentKey = serializeRouteToHash(route);
      setActiveLocalLabel(label);
      setHistoryStack(stack => {
        const entry: HistorySnapshotEntry = {
          id: `SEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          key: `${currentKey}::${localKey || label}`,
          route,
          label: `${formatRouteLabel(route)} ← ${label}`,
          localKey,
          selectionRestore: onRestorePrevious,
        };
        const top = stack[stack.length - 1];
        if (top && top.key === entry.key) {
          return stack;
        }
        return [...stack.slice(-39), entry];
      });
    },
    [route],
  );

  const goBack = useCallback(() => {
    setHistoryStack(stack => {
      if (stack.length > 0) {
        const nextStack = stack.slice(0, -1);
        const target = stack[stack.length - 1];
        setActiveLocalLabel(null);
        setRoute(target.route);
        const targetHash = serializeRouteToHash(target.route);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', targetHash);
        }
        if (target.selectionRestore) {
          queueMicrotask(() => {
            try {
              target.selectionRestore?.();
            } catch {
              // ignore stale restore callback
            }
          });
        }
        return nextStack;
      }

      // No history stack left: step cleanly out of modals/drawers or return to Launchpad home
      setActiveLocalLabel(null);
      setRoute(prev => {
        const fallback: RouteState =
          prev.modal || prev.moId || prev.timelineMoId
            ? { ...prev, modal: null, modalOrderId: null, modalPartId: null, moId: null, drawerTab: null, timelineMoId: null }
            : { ...DEFAULT_ROUTE, tab: 'dashboard' };
        const fallbackHash = serializeRouteToHash(fallback);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', fallbackHash);
        }
        return fallback;
      });
      return stack;
    });
  }, []);

  const canGoBack = useMemo(
    () =>
      historyStack.length > 0 ||
      route.tab !== 'dashboard' ||
      Boolean(route.moId) ||
      Boolean(route.timelineMoId) ||
      Boolean(route.modal),
    [historyStack.length, route],
  );

  const previousEntryLabel = useMemo(() => {
    if (historyStack.length > 0) {
      return historyStack[historyStack.length - 1].label;
    }
    if (route.moId || route.timelineMoId || route.modal) {
      return TAB_LABELS[route.tab] || 'نمای قبلی';
    }
    return 'صفحه اصلی (لانچ‌پد SAP Fiori)';
  }, [historyStack, route]);

  const currentRouteLabel = useMemo(() => {
    const base = formatRouteLabel(route);
    return activeLocalLabel ? `${base} / ${activeLocalLabel}` : base;
  }, [route, activeLocalLabel]);

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [
      {
        label: 'صفحه اصلی',
        onClick: () =>
          navigate({
            tab: 'dashboard',
            moId: null,
            timelineMoId: null,
            modal: null,
            docQuery: null,
          }),
      },
    ];
    if (route.tab !== 'dashboard') {
      const tabTitle = TAB_LABELS[route.tab] || route.tab;
      items.push({
        label: tabTitle,
        onClick: () => navigate({ tab: route.tab, moId: null, timelineMoId: null }),
      });
      const subLabel = formatRouteLabel(route);
      if (subLabel !== tabTitle) {
        items.push({ label: subLabel });
      }
    }
    if (activeLocalLabel) {
      items.push({ label: activeLocalLabel });
    }
    return items;
  }, [route, activeLocalLabel, navigate]);

  const openCreateMoModal = useCallback((partId?: string) => {
    navigate({
      modal: 'create-mo',
      modalPartId: partId || null,
    });
  }, [navigate]);

  const openWipCheckModal = useCallback((orderId?: string, partId?: string) => {
    navigate({
      modal: 'wip-check',
      modalOrderId: orderId || null,
      modalPartId: partId || null,
    });
  }, [navigate]);

  const closeModal = useCallback(() => {
    navigate({
      modal: null,
      modalOrderId: null,
      modalPartId: null,
    });
  }, [navigate]);

  const openMoDrawer = useCallback((moId: string, drawerTab: DrawerTabKey = 'TRACEABILITY') => {
    navigate({ moId, drawerTab });
  }, [navigate]);

  const closeMoDrawer = useCallback(() => {
    navigate({ moId: null, drawerTab: null });
  }, [navigate]);

  const openTimeline = useCallback((timelineMoId: string) => {
    navigate({ timelineMoId });
  }, [navigate]);

  const closeTimeline = useCallback(() => {
    navigate({ timelineMoId: null });
  }, [navigate]);

  const setProductionSubTab = useCallback((subTab: ProductionWorkbenchSubTab) => {
    navigate({
      tab: 'production',
      productionViewMode: 'ERP_WORKBENCH',
      productionModuleTab: subTab,
    });
  }, [navigate]);

  const traceDocument = useCallback((query: string, target: 'INVENTORY_LEDGER' | 'WIP_TRACEABILITY' | 'COILS' | 'CONTRACTS' = 'INVENTORY_LEDGER') => {
    const cleanQuery = (query || '').trim();
    if (target === 'WIP_TRACEABILITY') {
      navigate({ tab: 'wip', wipSubTab: 'TRACEABILITY', docQuery: cleanQuery, moId: null });
    } else if (target === 'COILS') {
      navigate({ tab: 'inventory', inventorySubTab: 'COILS', docQuery: cleanQuery, moId: null });
    } else if (target === 'CONTRACTS') {
      navigate({ tab: 'contracts', docQuery: cleanQuery, moId: null });
    } else {
      navigate({ tab: 'inventory', inventorySubTab: 'MOVEMENT', docQuery: cleanQuery, moId: null });
    }
  }, [navigate]);

  const clearDocQuery = useCallback(() => {
    navigate({ docQuery: null }, { replace: true });
  }, [navigate]);

  const buildShareableUrl = useCallback((params?: RouteNavigateParams) => {
    if (typeof window === 'undefined') return '';
    const targetState: RouteState = { ...route, ...params };
    const hash = serializeRouteToHash(targetState);
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }, [route]);

  const contextValue = useMemo<RouterContextType>(() => ({
    route,
    navigate,
    goBack,
    pushSelectionStep,
    canGoBack,
    previousEntryLabel,
    currentRouteLabel,
    historyDepth: historyStack.length,
    breadcrumbs,
    openCreateMoModal,
    openWipCheckModal,
    closeModal,
    openMoDrawer,
    closeMoDrawer,
    openTimeline,
    closeTimeline,
    setProductionSubTab,
    traceDocument,
    clearDocQuery,
    buildShareableUrl,
  }), [
    route,
    navigate,
    goBack,
    pushSelectionStep,
    canGoBack,
    previousEntryLabel,
    currentRouteLabel,
    historyStack.length,
    breadcrumbs,
    openCreateMoModal,
    openWipCheckModal,
    closeModal,
    openMoDrawer,
    closeMoDrawer,
    openTimeline,
    closeTimeline,
    setProductionSubTab,
    traceDocument,
    clearDocQuery,
    buildShareableUrl,
  ]);

  return (
    <RouterContext.Provider value={contextValue}>
      {children}
    </RouterContext.Provider>
  );
};

export function useErpRouter(): RouterContextType {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useErpRouter must be used within an ErpRouterProvider');
  }
  return ctx;
}
