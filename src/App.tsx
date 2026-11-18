import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { TabKey, SubModuleNavParams, MachineSubTabKey } from './components/Sidebar';
import { FioriLaunchpadView } from './components/fiori/FioriLaunchpadView';
import { TransactionsVouchersView } from './components/TransactionsVouchersView';
import { InventoryModuleView, InventorySubTab } from './components/inventory/InventoryModuleView';
import { MasterDataHubView, MasterSubSection } from './components/MasterDataHubView';
import { MachinesView } from './components/MachinesView';
import { UserManagementView } from './components/UserManagementView';
import { SapcoMaterialsView } from './components/SapcoMaterialsView';
import { ProductionWipModuleView } from './components/wip/ProductionWipModuleView';
import { ProductionPlanningModuleView, PlanningSubTabKey } from './components/planning/ProductionPlanningModuleView';
import { ErpProductionWorkbenchView, ProductionWorkbenchSubTab } from './components/production/ErpProductionWorkbenchView';
import { ManagementReportsModuleView } from './components/reports/ManagementReportsModuleView';
import { SalesContractsModuleView } from './components/contracts/SalesContractsModuleView';
import { ErpSyncModal } from './components/ErpSyncModal';
import { TemplateSwitcherModal } from './components/TemplateSwitcherModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { SystemHelpWalkthroughModal, HelpWizardLaunchParams } from './components/common/SystemHelpWalkthroughModal';
import { AdvancedIndustrialScenarioWizardModal } from './components/common/AdvancedIndustrialScenarioWizardModal';
import { ContextualActionMenu } from './components/common/ContextualActionMenu';
import { PageGuideBar } from './components/common/PageGuideSystem';
import { OfflineIndicator } from './components/pwa/PWAInstallButton';
import { AiActionPayload } from './types/ai';
import { ErpLayoutTemplate, ErpColorTheme } from './types/theme';
import { EnterpriseUxProvider } from './context/EnterpriseUxContext';
import { ErpRouterProvider, useErpRouter } from './context/RouterContext';

import {
  Part,
  Machine,
  Routing,
  InventoryTransaction,
  UserRoleProfile,
  VoucherType,
  DieMold,
  Operator,
  FactoryHall,
  ProductionPlan,
  SapcoCoilReceipt,
} from './types/inventory';
import { CloudSyncCheckResult } from './types/dbSync';
import { toPersianDigits } from './utils/formatters';
import {
  CloudDownload,
  CloudUpload,
  RefreshCw,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

function AppContent() {
  const router = useErpRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(router.route.tab);
  const [activeInventorySubTab, setActiveInventorySubTab] = useState<InventorySubTab>(router.route.inventorySubTab);
  const [pendingInventoryModal, setPendingInventoryModal] = useState<
    'RECEIPT' | 'ISSUE' | 'RETURN' | 'TRANSFER' | null
  >(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiReceiptDraft, setAiReceiptDraft] = useState<any>(null);
  const [aiIssueDraft, setAiIssueDraft] = useState<any>(null);
  const [productionViewMode, setProductionViewMode] = useState<'ERP_WORKBENCH' | 'VOUCHERS'>(
    router.route.productionViewMode
  );
  const [activeProductionModuleTab, setActiveProductionModuleTab] = useState<ProductionWorkbenchSubTab>(
    router.route.productionModuleTab
  );
  const [activePlanningSubTab, setActivePlanningSubTab] = useState<PlanningSubTabKey>(
    router.route.planningSubTab
  );
  const [activeMachineSubTab, setActiveMachineSubTab] = useState<MachineSubTabKey>(
    router.route.machineSubTab
  );
  const [activeMasterSubSection, setActiveMasterSubSection] = useState<MasterSubSection>(
    router.route.masterSubSection || 'PARTS'
  );
  const [activeSettingsSubTab, setActiveSettingsSubTab] = useState<'rbac' | 'db_architecture'>(
    router.route.settingsSubTab || 'rbac'
  );
  const [activeReportSubTab, setActiveReportSubTab] = useState<string>(
    router.route.reportSubTab || 'plan_vs_actual'
  );

  // Synchronize state when URL changes (Browser Back / Forward buttons or deep links)
  useEffect(() => {
    setActiveTab(router.route.tab);
    setActiveInventorySubTab(router.route.inventorySubTab);
    setProductionViewMode(router.route.productionViewMode);
    setActiveProductionModuleTab(router.route.productionModuleTab);
    setActivePlanningSubTab(router.route.planningSubTab);
    setActiveMachineSubTab(router.route.machineSubTab);
    if (router.route.masterSubSection) {
      setActiveMasterSubSection(router.route.masterSubSection);
    }
    if (router.route.settingsSubTab) {
      setActiveSettingsSubTab(router.route.settingsSubTab);
    }
    if (router.route.reportSubTab) {
      setActiveReportSubTab(router.route.reportSubTab);
    }
  }, [router.route]);

  // Multi-Template & Color Theme Engine (Persisted in localStorage)
  const [layoutTemplate, setLayoutTemplate] = useState<ErpLayoutTemplate>(() => {
    const saved = localStorage.getItem('kpims_layout_template') as ErpLayoutTemplate | null;
    return saved || 'HUB_WORKSPACE';
  });
  const [colorTheme, setColorTheme] = useState<ErpColorTheme>(() => {
    const saved = localStorage.getItem('kpims_color_theme') as ErpColorTheme | null;
    return saved || 'EMERALD_KOSAR';
  });
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const handleSelectTemplate = (tpl: ErpLayoutTemplate) => {
    setLayoutTemplate(tpl);
    localStorage.setItem('kpims_layout_template', tpl);
    if (tpl === 'ODOO_ENTERPRISE') {
      setColorTheme('ODOO_PLUM');
      localStorage.setItem('kpims_color_theme', 'ODOO_PLUM');
    } else if (tpl === 'HUB_WORKSPACE' || tpl === 'TABBED_WORKBENCH') {
      setColorTheme('EMERALD_KOSAR');
      localStorage.setItem('kpims_color_theme', 'EMERALD_KOSAR');
    }
  };

  const handleSelectColor = (clr: ErpColorTheme) => {
    setColorTheme(clr);
    localStorage.setItem('kpims_color_theme', clr);
  };

  const [initialVoucherType, setInitialVoucherType] = useState<VoucherType>('RECEIPT');
  const [initialPartId, setInitialPartId] = useState<string | undefined>(undefined);
  const [initialStageId, setInitialStageId] = useState<string | undefined>(undefined);
  const [isErpModalOpen, setIsErpModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAdvancedWizardOpen, setIsAdvancedWizardOpen] = useState(false);
  const [wizardLaunchParams, setWizardLaunchParams] = useState<HelpWizardLaunchParams | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Git-Like Opt-In Cloud DB Update Checker & Cross-Machine Push/Pull Sync State
  const [autoCheckCloudUpdates, setAutoCheckCloudUpdates] = useState(false);
  const [cloudCheckIntervalSec, setCloudCheckIntervalSec] = useState(120);
  const [cloudSyncCheck, setCloudSyncCheck] = useState<CloudSyncCheckResult | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<'CHECK' | 'PUSH' | 'PULL' | null>(null);
  const [dismissedRemoteHash, setDismissedRemoteHash] = useState<string | null>(null);
  const [cloudSyncToast, setCloudSyncToast] = useState<{ ok: boolean; text: string } | null>(null);

  // Core Data
  const [parts, setParts] = useState<Part[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [dies, setDies] = useState<DieMold[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [halls, setHalls] = useState<FactoryHall[]>([]);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [coils, setCoils] = useState<SapcoCoilReceipt[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Auth & Role (persisted in localStorage)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserRoleProfile>(() => {
    const validRoles: UserRoleProfile['role'][] = [
      'ADMIN',
      'PRODUCTION_MANAGER',
      'WAREHOUSE_KEEPER',
      'LINE_SUPERVISOR',
      'QC_INSPECTOR',
    ];
    const savedRole = typeof window !== 'undefined' ? (localStorage.getItem('kpims_active_role') as UserRoleProfile['role'] | null) : null;
    const role: UserRoleProfile['role'] = savedRole && validRoles.includes(savedRole) ? savedRole : 'ADMIN';
    if (typeof window !== 'undefined') {
      localStorage.setItem('kpims_active_role', role);
      localStorage.setItem('kpims_active_uid', 'USR-PROD-01');
    }
    return {
      uid: 'USR-PROD-01',
      email: 'admin.factory@sapco-supplier.ir',
      displayName: 'مهندس حسینی (مدیر تولید)',
      role,
      active: true,
      createdAt: new Date().toISOString(),
    };
  });

  const handleRoleChange = (role: UserRoleProfile['role']) => {
    localStorage.setItem('kpims_active_role', role);
    setCurrentUser(prev => ({ ...prev, role }));
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      user => {
        setFirebaseUser(user);
        if (user) {
          setCurrentUser(prev => ({
            ...prev,
            uid: user.uid,
            email: user.email || prev.email,
            displayName: user.displayName || prev.displayName,
          }));
        }
      },
      () => {
        setFirebaseUser(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch all data from server with Offline Factory Floor Cache fallback
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        sumRes,
        txRes,
        partsRes,
        machinesRes,
        routingsRes,
        diesRes,
        opsRes,
        hallsRes,
        plansRes,
        coilsRes,
      ] = await Promise.all([
        fetch('/api/inventory/summary').then(r => r.json()),
        fetch('/api/inventory/transactions').then(r => r.json()),
        fetch('/api/parts').then(r => r.json()),
        fetch('/api/machines').then(r => r.json()),
        fetch('/api/routings').then(r => r.json()),
        fetch('/api/dies').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/operators').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/halls').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/planning').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/sapco/coils').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      const uniqueById = <T extends { id?: string }>(items: T[]): T[] => {
        if (!Array.isArray(items)) return [];
        const map = new Map<string, T>();
        for (const item of items) {
          const key = (item?.id || '').trim();
          if (key) map.set(key, item);
        }
        return Array.from(map.values());
      };

      const cleanParts = partsRes.success ? uniqueById<Part>(partsRes.data) : undefined;
      const cleanMachines = machinesRes.success ? uniqueById<Machine>(machinesRes.data) : undefined;
      const cleanRoutings = routingsRes.success ? uniqueById<Routing>(routingsRes.data) : undefined;
      const cleanDies = diesRes.success ? uniqueById<DieMold>(diesRes.data) : undefined;
      const cleanOps = opsRes.success ? uniqueById<Operator>(opsRes.data) : undefined;
      const cleanHalls = hallsRes.success ? uniqueById<FactoryHall>(hallsRes.data) : undefined;
      const cleanPlans = plansRes.success ? uniqueById<ProductionPlan>(plansRes.data) : undefined;
      const cleanCoils = coilsRes.success ? uniqueById<SapcoCoilReceipt>(coilsRes.data) : undefined;

      if (sumRes.success) setSummary(sumRes.data);
      if (txRes.success) setTransactions(uniqueById(txRes.data));
      if (cleanParts) setParts(cleanParts);
      if (cleanMachines) setMachines(cleanMachines);
      if (cleanRoutings) setRoutings(cleanRoutings);
      if (cleanDies) setDies(cleanDies);
      if (cleanOps) setOperators(cleanOps);
      if (cleanHalls) setHalls(cleanHalls);
      if (cleanPlans) setPlans(cleanPlans);
      if (cleanCoils) setCoils(cleanCoils);

      try {
        localStorage.setItem(
          'kpims_offline_erp_snapshot',
          JSON.stringify({
            summary: sumRes.data,
            transactions: txRes.success ? uniqueById(txRes.data) : txRes.data,
            parts: cleanParts || partsRes.data,
            machines: cleanMachines || machinesRes.data,
            routings: cleanRoutings || routingsRes.data,
            dies: cleanDies || diesRes.data,
            operators: cleanOps || opsRes.data,
            halls: cleanHalls || hallsRes.data,
            plans: cleanPlans || plansRes.data,
            coils: cleanCoils || coilsRes.data,
          })
        );
      } catch {
        // ignore quota errors
      }
    } catch (err) {
      console.warn('Network unavailable — loading factory data from offline snapshot:', err);
      try {
        const cached = localStorage.getItem('kpims_offline_erp_snapshot');
        if (cached) {
          const dedup = <T extends { id?: string }>(arr: T[]) => {
            const map = new Map<string, T>();
            for (const x of arr || []) {
              const k = (x?.id || '').trim();
              if (k) map.set(k, x);
            }
            return Array.from(map.values());
          };
          const snap = JSON.parse(cached);
          if (snap.summary) setSummary(snap.summary);
          if (snap.transactions) setTransactions(dedup(snap.transactions));
          if (snap.parts) setParts(dedup(snap.parts));
          if (snap.machines) setMachines(dedup(snap.machines));
          if (snap.routings) setRoutings(dedup(snap.routings));
          if (snap.dies) setDies(dedup(snap.dies));
          if (snap.operators) setOperators(dedup(snap.operators));
          if (snap.halls) setHalls(dedup(snap.halls));
          if (snap.plans) setPlans(dedup(snap.plans));
          if (snap.coils) setCoils(dedup(snap.coils));
        }
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
    const handlePartsImported = () => {
      loadAllData();
    };
    window.addEventListener('kpims-parts-imported', handlePartsImported);
    return () => window.removeEventListener('kpims-parts-imported', handlePartsImported);
  }, [loadAllData]);

  // Read lightweight local sync preference on mount (zero remote DB queries unless opted in)
  useEffect(() => {
    fetch('/api/db/config')
      .then(r => r.json())
      .then(json => {
        if (json?.success && json.data) {
          setAutoCheckCloudUpdates(Boolean(json.data.autoCheckCloudUpdates));
          if (typeof json.data.cloudCheckIntervalSec === 'number') {
            setCloudCheckIntervalSec(json.data.cloudCheckIntervalSec);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleCheckCloudUpdates = useCallback(async (force = false) => {
    setCloudSyncBusy('CHECK');
    try {
      const res = await fetch(`/api/db/sync/check${force ? '?force=true' : ''}`);
      const json = await res.json();
      if (json?.success && json.data) {
        setCloudSyncCheck(json.data);
        if (force && json.data.state === 'IN_SYNC') {
          setCloudSyncToast({ ok: true, text: json.data.messageFa });
        }
      }
    } catch {
      // Keep UI responsive silently on transient offline failures
    } finally {
      setCloudSyncBusy(null);
    }
  }, []);

  // Periodic background manifest check ONLY when user opted-in with checkbox
  useEffect(() => {
    if (!autoCheckCloudUpdates) return;

    const initialTimer = window.setTimeout(() => {
      if (!document.hidden) {
        handleCheckCloudUpdates(false);
      }
    }, 1500);

    const intervalMs = Math.max(30, cloudCheckIntervalSec) * 1000;
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        handleCheckCloudUpdates(false);
      }
    }, intervalMs);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [autoCheckCloudUpdates, cloudCheckIntervalSec, handleCheckCloudUpdates]);

  // Auto-dismiss transient toast banner after 7s
  useEffect(() => {
    if (!cloudSyncToast) return;
    const timer = window.setTimeout(() => setCloudSyncToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [cloudSyncToast]);

  const handleToggleAutoCloudCheck = useCallback(
    async (enabled: boolean, intervalSec?: number) => {
      setAutoCheckCloudUpdates(enabled);
      if (typeof intervalSec === 'number') {
        setCloudCheckIntervalSec(intervalSec);
      }
      try {
        const res = await fetch('/api/db/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            autoCheckCloudUpdates: enabled,
            cloudCheckIntervalSec: intervalSec ?? cloudCheckIntervalSec,
          }),
        });
        const json = await res.json();
        if (json?.success && enabled) {
          await handleCheckCloudUpdates(true);
        }
      } catch {
        // ignore transient save error
      }
    },
    [cloudCheckIntervalSec, handleCheckCloudUpdates]
  );

  const handleCloudPush = useCallback(async (customDeviceLabel?: string) => {
    setCloudSyncBusy('PUSH');
    try {
      const res = await fetch('/api/db/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customDeviceLabel ? { deviceLabel: customDeviceLabel } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در آپلود اطلاعات به دیتابیس آنلاین');
      }
      if (json.checkResult) setCloudSyncCheck(json.checkResult);
      setDismissedRemoteHash(null);
      setCloudSyncToast({
        ok: !json.relationalSyncWarning,
        text: json.message,
      });
    } catch (err) {
      setCloudSyncToast({
        ok: false,
        text: err instanceof Error ? err.message : 'خطا در آپلود به دیتابیس آنلاین (Push)',
      });
    } finally {
      setCloudSyncBusy(null);
    }
  }, []);

  const handleCloudPull = useCallback(async () => {
    setCloudSyncBusy('PULL');
    try {
      const res = await fetch('/api/db/sync/pull', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در دریافت نسخه آنلاین');
      }
      if (json.checkResult) setCloudSyncCheck(json.checkResult);
      setDismissedRemoteHash(null);
      await loadAllData();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated', { detail: { type: 'CLOUD_PULL' } }));
      const warnText = json.localPgWarning ? ` (هشدار دیتابیس محلی: ${json.localPgWarning})` : '';
      setCloudSyncToast({ ok: true, text: `${json.message}${warnText}` });
    } catch (err) {
      setCloudSyncToast({
        ok: false,
        text: err instanceof Error ? err.message : 'خطا در به‌روزرسانی دیتابیس محلی از آنلاین (Pull)',
      });
    } finally {
      setCloudSyncBusy(null);
    }
  }, [loadAllData]);

  // Global Ctrl+Space Shortcut for Context-Aware AI Assistant (Upgrade 5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setIsAiModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Voucher Submission (Online + Offline Queue Support)
  const handleSubmitVoucher = async (payload: any) => {
    try {
      const enrichedPayload = {
        ...payload,
        createdByUid: currentUser.uid,
        createdByName: currentUser.displayName,
      };

      const res = await fetch('/api/inventory/validate-and-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichedPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ثبت سند در سرور');
      }

      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          const q = JSON.parse(localStorage.getItem('kpims_offline_voucher_queue') || '[]');
          q.push({ ...payload, queuedAt: new Date().toISOString() });
          localStorage.setItem('kpims_offline_voucher_queue', JSON.stringify(q));
        } catch {
          // ignore
        }
        return {
          success: true,
          message: 'سند در صف آفلاین کارگاه ذخیره شد و به محض اتصال به شبکه همگام‌سازی می‌شود.',
        };
      }
      return {
        success: false,
        message: err instanceof Error ? err.message : 'خطای ارتباط با سرور',
      };
    }
  };

  // Master Data Save/Update (with optimistic VIP / isPinned sync across all modules)
  const handleSavePart = async (partData: Partial<Part>) => {
    if (partData.id) {
      setParts(prev =>
        prev.map(p =>
          p.id === partData.id
            ? {
                ...p,
                ...partData,
                isVIP: partData.isVIP !== undefined ? partData.isVIP : partData.isPinned ?? p.isVIP,
                isPinned:
                  partData.isPinned !== undefined ? partData.isPinned : partData.isVIP ?? p.isPinned,
              }
            : p
        )
      );
    }
    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت قطعه');
      await loadAllData();
      window.dispatchEvent(
        new CustomEvent('kpims-master-data-updated', {
          detail: {
            type: 'PART',
            part: data.data || partData,
            oldCode: partData.id ? parts.find(p => p.id === partData.id)?.code : undefined,
            cascadeSummary: data.cascadeSummary,
          },
        }),
      );
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت قطعه';
      return { success: false, error: msg };
    }
  };

  const handleSaveMachine = async (mchData: Partial<Machine>) => {
    try {
      const res = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mchData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت ماشین');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت ماشین';
      return { success: false, error: msg };
    }
  };

  const handleSaveDie = async (dieData: Partial<DieMold>) => {
    try {
      const res = await fetch('/api/dies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dieData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت قالب');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت قالب';
      return { success: false, error: msg };
    }
  };

  const handleDeleteDie = async (id: string) => {
    try {
      const res = await fetch(`/api/dies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در حذف قالب');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در حذف قالب';
      return { success: false, error: msg };
    }
  };

  const handleSaveOperator = async (opData: Partial<Operator>) => {
    try {
      const res = await fetch('/api/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت اپراتور');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت اپراتور';
      return { success: false, error: msg };
    }
  };

  const handleDeleteOperator = async (opId: string) => {
    try {
      const res = await fetch(`/api/operators/${opId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در حذف اپراتور');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در حذف اپراتور';
      return { success: false, error: msg };
    }
  };

  const handleSaveHall = async (hallData: Partial<FactoryHall>) => {
    try {
      const res = await fetch('/api/halls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hallData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت سالن');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت سالن';
      return { success: false, error: msg };
    }
  };

  const handleSaveRouting = async (routingData: Partial<Routing>) => {
    try {
      const res = await fetch('/api/routings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routingData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ثبت مسیر تولید');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت مسیر تولید';
      return { success: false, error: msg };
    }
  };

  const handleDeleteRouting = async (routingId: string) => {
    try {
      const res = await fetch(`/api/routings/${routingId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در حذف مسیر');
      await loadAllData();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در حذف مسیر';
      return { success: false, error: msg };
    }
  };

  // Demo Data Reset & Clean Handlers
  const handleSeedDemo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/demo-data/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanDemo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/demo-data/clean', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVoucherWithType = (type: string, partId?: string, stageId?: string) => {
    setInitialVoucherType(type as VoucherType);
    setInitialPartId(partId);
    setInitialStageId(stageId);
    setActiveTab('production');
  };

  const handleDeepNavigate = (
    tab: any,
    subTab?: any,
    actionModal?: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'TRANSFER',
    docQuery?: string | null,
    moId?: string | null,
  ) => {
    const rawSub = typeof subTab === 'string' ? subTab : undefined;
    let resolvedTab: TabKey = 'dashboard';

    if (tab === 'vouchers') {
      resolvedTab = 'production';
      setActiveTab('production');
      setProductionViewMode('VOUCHERS');
      router.navigate({ tab: 'production', productionViewMode: 'VOUCHERS', docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'parts') {
      resolvedTab = 'master_data';
      setActiveTab('master_data');
      setActiveMasterSubSection('PARTS');
      router.navigate({ tab: 'master_data', masterSubSection: 'PARTS', docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'bom') {
      resolvedTab = 'master_data';
      setActiveTab('master_data');
      setActiveMasterSubSection('BOM');
      router.navigate({ tab: 'master_data', masterSubSection: 'BOM', docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'audit') {
      resolvedTab = 'reports';
      setActiveTab('reports');
      router.navigate({ tab: 'reports', docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'mrp') {
      resolvedTab = 'planning';
      setActiveTab('planning');
      setActivePlanningSubTab('mrp');
      router.navigate({ tab: 'planning', planningSubTab: 'mrp', docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'users' || tab === 'settings') {
      resolvedTab = 'settings';
      const settingsTarget: 'rbac' | 'db_architecture' =
        rawSub === 'db_architecture' || rawSub === 'db' ? 'db_architecture' : 'rbac';
      setActiveTab('settings');
      setActiveSettingsSubTab(settingsTarget);
      router.navigate({ tab: 'settings', settingsSubTab: settingsTarget, moId: null });
    } else if (tab === 'master_data') {
      resolvedTab = 'master_data';
      const masterTarget = (rawSub || 'PARTS') as MasterSubSection;
      setActiveTab('master_data');
      setActiveMasterSubSection(masterTarget);
      router.navigate({ tab: 'master_data', masterSubSection: masterTarget, docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'planning') {
      resolvedTab = 'planning';
      const planMap: Record<string, PlanningSubTabKey> = {
        mrp: 'mrp',
        MRP: 'mrp',
        capacity_planning: 'capacity_planning',
        CAPACITY: 'capacity_planning',
        approved_plans: 'approved_plans',
        PROPOSALS: 'recommendations',
        recommendations: 'recommendations',
        RECOMMENDATIONS: 'recommendations',
        daily_schedule: 'daily_schedule',
        orders: 'orders',
        consumables: 'consumables',
        dashboard: 'dashboard',
        workflow_doc: 'workflow_doc',
        WORKFLOW_DOC: 'workflow_doc',
        erp_workbench: 'erp_workbench',
      };
      const planTarget = (rawSub && planMap[rawSub]) || 'erp_workbench';
      setActiveTab('planning');
      setActivePlanningSubTab(planTarget);
      router.navigate({ tab: 'planning', planningSubTab: planTarget, docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'contracts') {
      resolvedTab = 'contracts';
      const contractsTarget: 'CONTRACTS_QUOTAS' | 'CUSTOMER_ORDERS' =
        rawSub === 'CUSTOMER_ORDERS' ? 'CUSTOMER_ORDERS' : 'CONTRACTS_QUOTAS';
      setActiveTab('contracts');
      router.navigate({ tab: 'contracts', contractsSubTab: contractsTarget, docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'machines') {
      resolvedTab = 'machines';
      const mchTarget = (rawSub || 'machines') as MachineSubTabKey;
      setActiveTab('machines');
      setActiveMachineSubTab(mchTarget);
      router.navigate({ tab: 'machines', machineSubTab: mchTarget, docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'production') {
      resolvedTab = 'production';
      setActiveTab('production');
      if (rawSub === 'VOUCHERS') {
        setProductionViewMode('VOUCHERS');
        router.navigate({ tab: 'production', productionViewMode: 'VOUCHERS', docQuery: docQuery ?? null, moId: null });
      } else {
        const prodTarget = (rawSub || 'MULTI_PART_SCHEDULER') as ProductionWorkbenchSubTab;
        setProductionViewMode('ERP_WORKBENCH');
        setActiveProductionModuleTab(prodTarget);
        router.navigate({
          tab: 'production',
          productionViewMode: 'ERP_WORKBENCH',
          productionModuleTab: prodTarget,
          docQuery: docQuery ?? null,
          moId: moId ?? null,
        });
      }
    } else if (tab === 'wip') {
      resolvedTab = 'wip';
      const wipMap: Record<string, any> = {
        ORDERS: 'ORDERS',
        BOTTLENECK: 'BOTTLENECK',
        TRACEABILITY: 'TRACEABILITY',
        DASHBOARD: 'DASHBOARD',
        TRANSFERS: 'TRANSFERS',
        STAGES: 'STAGES',
        UNIFIED_DIRECTORY: 'UNIFIED_DIRECTORY',
      };
      const wipTarget = (rawSub && wipMap[rawSub]) || 'ORDERS';
      setActiveTab('wip');
      router.navigate({ tab: 'wip', wipSubTab: wipTarget, docQuery: docQuery ?? null, moId: moId ?? null });
    } else if (tab === 'reports') {
      resolvedTab = 'reports';
      const reportTarget = rawSub ? rawSub.toLowerCase() : 'plan_vs_actual';
      setActiveTab('reports');
      setActiveReportSubTab(reportTarget);
      router.navigate({ tab: 'reports', reportSubTab: reportTarget, docQuery: docQuery ?? null, moId: null });
    } else if (tab === 'inventory') {
      resolvedTab = 'inventory';
      const invMap: Record<string, InventorySubTab> = {
        DASHBOARD: 'DASHBOARD',
        INQUIRY: 'INQUIRY',
        STOCK: 'INQUIRY',
        MOVEMENT: 'MOVEMENT',
        COILS: 'COILS',
        ALERTS: 'ALERTS',
        CONTRACTS: 'CONTRACTS',
        CUSTOM_REPORTS: 'CUSTOM_REPORTS',
        IMPORT_EXPORT: 'IMPORT_EXPORT',
        SAPCO: 'SAPCO',
        STAGES: 'STAGES',
        QUALITY: 'QUALITY_QM',
        QUALITY_QM: 'QUALITY_QM',
      };
      const invTarget = (rawSub && invMap[rawSub]) || 'DASHBOARD';
      setActiveTab('inventory');
      setActiveInventorySubTab(invTarget);
      router.navigate({ tab: 'inventory', inventorySubTab: invTarget, docQuery: docQuery ?? null, moId: null });
    } else {
      resolvedTab = tab;
      setActiveTab(resolvedTab);
      router.navigate({ tab: resolvedTab, docQuery: docQuery ?? null, moId: moId ?? null });
    }

    if (actionModal) {
      setPendingInventoryModal(actionModal);
    }
  };

  const handleSubModuleNavigate = (tab: TabKey, navParams?: SubModuleNavParams) => {
    setActiveTab(tab);
    if (!navParams) {
      router.navigate({ tab, moId: null });
      return;
    }
    if (navParams.inventorySubTab) setActiveInventorySubTab(navParams.inventorySubTab);
    if (navParams.productionViewMode) setProductionViewMode(navParams.productionViewMode);
    if (navParams.productionModuleTab) setActiveProductionModuleTab(navParams.productionModuleTab);
    if (navParams.planningSubTab) setActivePlanningSubTab(navParams.planningSubTab);
    if (navParams.machineSubTab) setActiveMachineSubTab(navParams.machineSubTab);
    if (navParams.masterSubSection) setActiveMasterSubSection(navParams.masterSubSection);
    router.navigate({
      tab,
      inventorySubTab: navParams.inventorySubTab,
      productionViewMode: navParams.productionViewMode,
      productionModuleTab: navParams.productionModuleTab,
      planningSubTab: navParams.planningSubTab,
      machineSubTab: navParams.machineSubTab,
      masterSubSection: navParams.masterSubSection,
      moId: null,
    });
  };

  const handleExecuteAiAction = (action: AiActionPayload) => {
    // Explicitly reset any pending inventory modal popups
    setPendingInventoryModal(null);

    if (action.actionType === 'OPEN_RECEIPT') {
      setActiveTab('inventory');
      setActiveInventorySubTab('DASHBOARD');
      if (action.prefillReceipt) {
        setAiReceiptDraft(action.prefillReceipt);
      }
      setPendingInventoryModal('RECEIPT');
    } else if (action.actionType === 'OPEN_ISSUE') {
      setActiveTab('inventory');
      setActiveInventorySubTab('DASHBOARD');
      if (action.prefillIssue) {
        setAiIssueDraft(action.prefillIssue);
      }
      setPendingInventoryModal('ISSUE');
    } else if (action.actionType === 'OPEN_CREATE_MO') {
      setActiveTab('production');
      setProductionViewMode('ERP_WORKBENCH');
      setActiveProductionModuleTab('MULTI_PART_SCHEDULER');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kpims:contextual-action', { detail: { actionType: 'OPEN_CREATE_MO' } }));
      }, 120);
    } else if (action.actionType === 'OPEN_TRACK_ORDER') {
      setActiveTab('production');
      setProductionViewMode('ERP_WORKBENCH');
      setActiveProductionModuleTab('MULTI_PART_SCHEDULER');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kpims:contextual-action', { detail: { actionType: 'OPEN_TRACK_FIRST_ORDER' } }));
      }, 120);
    } else if (action.actionType === 'OPEN_HEAT_TRACEABILITY') {
      setActiveTab('sapco');
    } else if (action.actionType === 'CHECK_REORDER') {
      setActiveTab('inventory');
      setActiveInventorySubTab('ALERTS');
    } else if (action.actionType === 'NAVIGATE' && action.targetTab) {
      const target = action.targetTab as TabKey;
      setActiveTab(target);
      if (target === 'inventory' && action.targetSubTab) {
        setActiveInventorySubTab(action.targetSubTab as InventorySubTab);
      } else if (target === 'machines' && action.targetSubTab) {
        setActiveMachineSubTab(action.targetSubTab as any);
      } else if (target === 'production') {
        setProductionViewMode('ERP_WORKBENCH');
        if (action.targetSubTab) {
          setActiveProductionModuleTab(action.targetSubTab as any);
        }
      } else if (target === 'planning' && action.targetSubTab) {
        setActivePlanningSubTab(action.targetSubTab as any);
      }
    } else if (action.actionType === 'QUERY_STOCK') {
      setActiveTab('inventory');
      setActiveInventorySubTab('INQUIRY');
    }
  };

  // Compute top-level reorder alert summary counts for Navbar & Sidebar badges
  const stageBalancesList: any[] = summary?.stageBalances || [];
  let reorderAlertsCount = 0;
  let criticalAlertsCount = 0;
  parts.forEach(part => {
    if (typeof part.minStock === 'number' && part.minStock > 0) {
      const matchingStages = stageBalancesList.filter(
        sb => (sb.partId === part.id || sb.partCode === part.code) && sb.stageId !== 'STAGE_SCRAP_YARD'
      );
      const currentStock = matchingStages.reduce(
        (sum, sb) => sum + (part.unit === 'KG' ? sb.totalKg || sb.usableQty : sb.usableQty),
        0
      );
      if (currentStock < part.minStock) {
        reorderAlertsCount++;
        const coverage = Math.round((currentStock / part.minStock) * 100);
        if (currentStock <= 0 || coverage <= 25) {
          criticalAlertsCount++;
        }
      }
    }
  });

  // SAP S/4HANA Fiori layout: full-width Shell Bar spanning across the top above the side navigation and canvas.
  const isSidebarFullHeight = false;

  const navbarElement = (
    <Navbar
      activeTab={activeTab}
      layoutTemplate={layoutTemplate}
      colorTheme={colorTheme}
      currentUser={currentUser}
      parts={parts}
      coilsCount={coils.length}
      reorderAlertsCount={reorderAlertsCount}
      criticalAlertsCount={criticalAlertsCount}
      onRoleChange={handleRoleChange}
      onNavigate={handleDeepNavigate}
      onOpenTemplateModal={() => setIsTemplateModalOpen(true)}
      onQuickTemplateChange={handleSelectTemplate}
      onOpenAiAssistant={() => setIsAiModalOpen(true)}
      onSeedDemo={handleSeedDemo}
      onCleanDemo={handleCleanDemo}
      onOpenErpModal={() => setIsErpModalOpen(true)}
      onOpenHelpModal={() => setIsHelpModalOpen(true)}
      loading={loading}
      cloudSyncCheck={cloudSyncCheck}
      autoCheckCloudUpdates={autoCheckCloudUpdates}
      cloudSyncBusy={cloudSyncBusy}
      onToggleAutoCloudCheck={handleToggleAutoCloudCheck}
      onCheckCloudUpdates={handleCheckCloudUpdates}
      onCloudPull={handleCloudPull}
      onCloudPush={() => handleCloudPush()}
    />
  );

  const remoteAlertKey = cloudSyncCheck?.cloudManifest?.contentHash || 'legacy';
  const showCloudUpdateBanner =
    cloudSyncCheck &&
    (cloudSyncCheck.state === 'REMOTE_AHEAD' || cloudSyncCheck.state === 'DIVERGED') &&
    dismissedRemoteHash !== remoteAlertKey;

  const mainContentElement = (
    <main className="flex-1 px-4 py-4 md:px-6 md:py-5 overflow-y-auto max-w-[1440px] mx-auto w-full space-y-4">
      {/* Git-Style Online Database Update Alert Bar */}
      {showCloudUpdateBanner && cloudSyncCheck && (
        <div
          className={`rounded-md border px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs ${
            cloudSyncCheck.state === 'DIVERGED'
              ? 'bg-[#ffecec] border-[#f5b7b1] text-[#8b0000]'
              : 'bg-[#fff8ec] border-[#f5cba7] text-[#6d4506]'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <GitBranch className="w-5 h-5 shrink-0 mt-0.5 text-[#b45309]" />
            <div className="text-xs space-y-0.5">
              <div className="font-bold flex flex-wrap items-center gap-2">
                <span>
                  {cloudSyncCheck.state === 'DIVERGED'
                    ? 'تضاد بین نسخه محلی و نسخه آنلاین (هر دو تغییر کرده‌اند)'
                    : 'نسخه جدیدتر پایگاه داده در سیستم آنلاین موجود است (Git Update)'}
                </span>
                {cloudSyncCheck.cloudManifest && (
                  <span className="px-2 py-0.5 rounded bg-white/80 border border-[#e6c280] font-mono text-[10px]">
                    Rev #{toPersianDigits(cloudSyncCheck.cloudManifest.revision)} · آپلود از «{cloudSyncCheck.cloudManifest.deviceLabel}»
                  </span>
                )}
              </div>
              <div className="text-[11px] opacity-90">
                {cloudSyncCheck.messageFa}
                {cloudSyncCheck.cloudManifest && (
                  <span className="mr-2 font-medium">
                    ({toPersianDigits(cloudSyncCheck.cloudManifest.counts.parts)} قطعه،{' '}
                    {toPersianDigits(cloudSyncCheck.cloudManifest.counts.manufacturingOrders)} دستور تولید ·{' '}
                    {new Date(cloudSyncCheck.cloudManifest.updatedAt).toLocaleString('fa-IR')})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCloudPull}
              disabled={Boolean(cloudSyncBusy)}
              className="sap-btn-emphasized text-xs px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>{cloudSyncBusy === 'PULL' ? 'در حال به‌روزرسانی...' : 'به‌روزرسانی دیتابیس محلی (Pull)'}</span>
            </button>

            {cloudSyncCheck.state === 'DIVERGED' && (
              <button
                type="button"
                onClick={() => handleCloudPush()}
                disabled={Boolean(cloudSyncBusy)}
                className="sap-btn-standard text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{cloudSyncBusy === 'PUSH' ? 'در حال آپلود...' : 'ارسال نسخه محلی (Push)'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCheckCloudUpdates(true)}
              disabled={Boolean(cloudSyncBusy)}
              className="sap-btn-standard text-xs px-2.5 py-1.5 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="بررسی مجدد نسخه آنلاین"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncBusy === 'CHECK' ? 'animate-spin' : ''}`} />
              <span>چک مجدد</span>
            </button>

            <button
              type="button"
              onClick={() => handleDeepNavigate('settings', 'db_architecture')}
              className="text-[11px] underline font-bold px-1.5 cursor-pointer"
            >
              تنظیمات همگام‌سازی
            </button>

            <button
              type="button"
              onClick={() => setDismissedRemoteHash(remoteAlertKey)}
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
              title="بستن موقت این اعلان"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Sync Result Toast Notification */}
      {cloudSyncToast && (
        <div
          className={`rounded-md border px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
            cloudSyncToast.ok
              ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]'
              : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
          }`}
        >
          <div className="flex items-center gap-2">
            {cloudSyncToast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span className="font-semibold">{cloudSyncToast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setCloudSyncToast(null)}
            className="p-1 hover:bg-black/5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zero-Lag Contextual Page & Button Training Bar (All Site Views) */}
      <PageGuideBar
        context={{
          tab: activeTab,
          masterSubSection: activeMasterSubSection,
          inventorySubTab: activeInventorySubTab,
          planningSubTab: activePlanningSubTab,
          productionViewMode,
          productionModuleTab: activeProductionModuleTab,
          wipSubTab: router.route.wipSubTab,
          machineSubTab: activeMachineSubTab,
          contractsSubTab: router.route.contractsSubTab,
          settingsSubTab: activeSettingsSubTab,
          reportSubTab: activeReportSubTab,
        }}
        onNavigate={(tab, subTab) => handleDeepNavigate(tab, subTab)}
      />

      {/* 1. SAP Fiori Launchpad Home */}
      {activeTab === 'dashboard' && (
        <FioriLaunchpadView
          currentUser={currentUser}
          summary={summary}
          recentTransactions={transactions}
          machines={machines}
          parts={parts}
          routings={routings}
          dies={dies}
          halls={halls}
          coils={coils}
          reorderAlertsCount={reorderAlertsCount}
          criticalAlertsCount={criticalAlertsCount}
          onNavigateToTab={handleDeepNavigate}
          onNavigateSubModule={handleSubModuleNavigate}
          onOpenNewVoucher={handleOpenVoucherWithType}
          onSubmitVoucher={handleSubmitVoucher}
          initialOrderId={router.route.moId}
          initialDrawerTab={router.route.drawerTab}
          onOrderDrawerChange={(orderId, tab) => {
            if (orderId) {
              router.openMoDrawer(orderId, tab);
            } else {
              router.closeMoDrawer();
            }
          }}
        />
      )}

      {/* 2. Master Data Hub (Supports both Image 1 Card Hub & Image 2 Tabbed Workbench) */}
      {activeTab === 'master_data' && (
        <MasterDataHubView
          layoutTemplate={layoutTemplate}
          colorTheme={colorTheme}
          initialSection={activeMasterSubSection}
          onSectionChange={setActiveMasterSubSection}
          parts={parts}
          routings={routings}
          machines={machines}
          dies={dies}
          operators={operators}
          halls={halls}
          coils={coils}
          onSavePart={handleSavePart}
          onSaveRouting={handleSaveRouting}
          onDeleteRouting={handleDeleteRouting}
          onSaveMachine={handleSaveMachine}
          onSaveDie={handleSaveDie}
          onDeleteDie={handleDeleteDie}
          onSaveOperator={handleSaveOperator}
          onSaveHall={handleSaveHall}
          onDirectProduce={partId => {
            handleOpenVoucherWithType('PRODUCTION_OUTPUT', partId);
          }}
          onRefresh={loadAllData}
          onNavigateToInventoryCoils={() => {
            setActiveTab('inventory');
            setActiveInventorySubTab('COILS');
          }}
          onNavigateToPlanning={() => setActiveTab('planning')}
        />
      )}

      {/* 2.5 Sales & Contracts Module (Contract -> MRP -> MO Chain) */}
      {activeTab === 'contracts' && (
        <SalesContractsModuleView
          parts={parts}
          currentUser={currentUser}
          initialSubTab={router.route.contractsSubTab || 'CONTRACTS_QUOTAS'}
          onNavigateToPlanning={() => handleSubModuleNavigate('planning', { planningSubTab: 'mrp' })}
          onNavigateToInventoryLedger={contractCode => router.traceDocument(contractCode, 'INVENTORY_LEDGER')}
          onNavigateToTab={handleDeepNavigate}
          onNavigateSubModule={handleSubModuleNavigate}
          onGlobalRefresh={loadAllData}
        />
      )}

      {/* 3. Inventory Management Module */}
      {activeTab === 'inventory' && (
        <InventoryModuleView
          parts={parts}
          stageBalances={summary?.stageBalances || []}
          currentUser={{
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            role: currentUser.role,
          }}
          initialSubTab={activeInventorySubTab}
          initialSearchQuery={router.route.docQuery || undefined}
          initialActionModal={pendingInventoryModal}
          initialReceiptDraft={aiReceiptDraft}
          initialIssueDraft={aiIssueDraft}
          onClearInitialAction={() => {
            setPendingInventoryModal(null);
            setAiReceiptDraft(null);
            setAiIssueDraft(null);
          }}
          onGlobalRefresh={loadAllData}
          onNavigateToPlanning={() => setActiveTab('planning')}
          onSubTabChange={subTab => {
            setActiveInventorySubTab(subTab);
            router.navigate({ inventorySubTab: subTab, docQuery: null });
          }}
        />
      )}

          {/* 4. Production */}
          {activeTab === 'production' && (
            <div className="space-y-3">
              <div className="sap-card px-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setProductionViewMode('ERP_WORKBENCH')}
                    className={`sap-icon-tab ${
                      productionViewMode === 'ERP_WORKBENCH' ? 'sap-icon-tab-active' : ''
                    }`}
                  >
                    میز کار و برنامه تولید (PP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductionViewMode('VOUCHERS')}
                    className={`sap-icon-tab ${
                      productionViewMode === 'VOUCHERS' ? 'sap-icon-tab-active' : ''
                    }`}
                  >
                    ثبت قبض تکی کارگاه (MIGO)
                  </button>
                </div>
              </div>

              {productionViewMode === 'ERP_WORKBENCH' ? (
                <ErpProductionWorkbenchView
                  parts={parts}
                  routings={routings}
                  machines={machines}
                  initialModuleTab={activeProductionModuleTab}
                  onModuleTabChange={tab => {
                    setActiveProductionModuleTab(tab);
                    router.navigate({ productionModuleTab: tab });
                  }}
                  initialMoId={router.route.moId}
                  onMoSelect={moId => {
                    if (moId) {
                      router.openMoDrawer(moId);
                    } else {
                      router.closeMoDrawer();
                    }
                  }}
                  onRefreshData={loadAllData}
                />
              ) : (
                <TransactionsVouchersView
                  parts={parts}
                  machines={machines}
                  dies={dies}
                  operators={operators}
                  stageBalances={summary?.stageBalances || []}
                  initialVoucherType={initialVoucherType}
                  initialPartId={initialPartId}
                  initialStageId={initialStageId}
                  onSubmitVoucher={handleSubmitVoucher}
                  onTrackVoucher={docQuery => router.traceDocument(docQuery || '', 'INVENTORY_LEDGER')}
                />
              )}
            </div>
          )}

          {/* 5. Production Execution & WIP Module */}
          {activeTab === 'wip' && (
            <ProductionWipModuleView
              parts={parts}
              machines={machines}
              operators={operators}
              stageBalances={summary?.stageBalances || []}
              initialView={router.route.wipSubTab}
              initialTraceQuery={router.route.docQuery || undefined}
              onGlobalRefresh={loadAllData}
            />
          )}

          {/* 6. Production Planning Engine */}
          {activeTab === 'planning' && (
            <ProductionPlanningModuleView
              parts={parts}
              routings={routings}
              machines={machines}
              dies={dies}
              initialSubTab={activePlanningSubTab}
              onSubTabChange={subTab => {
                setActivePlanningSubTab(subTab);
                router.navigate({ planningSubTab: subTab });
              }}
              onGlobalRefresh={loadAllData}
            />
          )}

          {/* 7. Machines and Capacity */}
          {activeTab === 'machines' && (
            <MachinesView
              machines={machines}
              dies={dies}
              operators={operators}
              halls={halls}
              parts={parts}
              initialSubTab={activeMachineSubTab}
              onSubTabChange={subTab => {
                setActiveMachineSubTab(subTab);
                router.navigate({ machineSubTab: subTab });
              }}
              onSaveMachine={handleSaveMachine}
              onSaveDie={handleSaveDie}
              onDeleteDie={handleDeleteDie}
              onSaveOperator={handleSaveOperator}
              onDeleteOperator={handleDeleteOperator}
              onSaveHall={handleSaveHall}
            />
          )}

          {/* 8. SAPCO Materials */}
          {activeTab === 'sapco' && (
            <SapcoMaterialsView
              coils={coils}
              parts={parts}
              onRefresh={loadAllData}
              loading={loading}
            />
          )}

          {/* 9. Management Reporting & Control Module */}
          {activeTab === 'reports' && (
            <ManagementReportsModuleView
              parts={parts}
              machines={machines}
              initialReportType={activeReportSubTab as any}
              onReportTypeChange={rep => {
                setActiveReportSubTab(rep);
                router.navigate({ reportSubTab: rep });
              }}
            />
          )}

          {/* 10. Users and Settings */}
          {activeTab === 'settings' && (
            <UserManagementView
              currentUser={currentUser}
              onRoleChange={role => setCurrentUser(prev => ({ ...prev, role }))}
              firebaseUser={firebaseUser}
              initialSubTab={activeSettingsSubTab}
              onSubTabChange={sub => {
                setActiveSettingsSubTab(sub);
                router.navigate({ settingsSubTab: sub });
              }}
              cloudSyncCheck={cloudSyncCheck}
              autoCheckCloudUpdates={autoCheckCloudUpdates}
              cloudCheckIntervalSec={cloudCheckIntervalSec}
              cloudSyncBusy={cloudSyncBusy}
              onToggleAutoCloudCheck={handleToggleAutoCloudCheck}
              onCheckCloudUpdates={handleCheckCloudUpdates}
              onCloudPush={handleCloudPush}
              onCloudPull={handleCloudPull}
              onRefreshData={loadAllData}
            />
          )}
    </main>
  );

  return (
    <div className="min-h-screen bg-[#f0f0f0] text-[#333333] flex flex-col font-sans selection:bg-[#007cc0] selection:text-white">
      {navbarElement}
      <div className="flex-1 flex flex-col min-w-0">
        {mainContentElement}
      </div>

      {/* Offline Mode Indicator for Factory Floor Operations */}
      <OfflineIndicator />

      {/* Template & Color Theme Switcher + UX/UI Analysis Modal */}
      <TemplateSwitcherModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        activeTemplate={layoutTemplate}
        activeColor={colorTheme}
        onSelectTemplate={handleSelectTemplate}
        onSelectColor={handleSelectColor}
        onPreviewMasterData={() => setActiveTab('master_data')}
      />

      {/* ERP Sync Modal */}
      <ErpSyncModal
        isOpen={isErpModalOpen}
        onClose={() => setIsErpModalOpen(false)}
        partsCount={parts.length}
        txCount={transactions.length}
        onOpenDbSettings={() => {
          setIsErpModalOpen(false);
          handleDeepNavigate('settings', 'db_architecture');
        }}
        cloudSyncCheck={cloudSyncCheck}
        autoCheckCloudUpdates={autoCheckCloudUpdates}
        cloudSyncBusy={cloudSyncBusy}
        onToggleAutoCloudCheck={enabled => handleToggleAutoCloudCheck(enabled)}
        onCheckCloudUpdates={handleCheckCloudUpdates}
        onCloudPush={() => handleCloudPush()}
        onCloudPull={handleCloudPull}
      />

      {/* AI Assistant Modal (Context-Aware Voice & Text with Ctrl+Space) */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        parts={parts}
        currentPageTab={activeTab}
        coils={coils}
        summary={summary}
        onExecuteAction={handleExecuteAiAction}
      />

      {/* Interactive Scenario Walkthrough & Module Directory Modal */}
      <SystemHelpWalkthroughModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onNavigate={handleDeepNavigate}
        onOpenAdvancedWizard={params => {
          setWizardLaunchParams(params);
          setIsAdvancedWizardOpen(true);
        }}
      />

      {/* Advanced Industrial Scenario Wizard (12 scenarios + Part Lifecycle feasibility & MRP) */}
      <AdvancedIndustrialScenarioWizardModal
        isOpen={isAdvancedWizardOpen}
        onClose={() => {
          setIsAdvancedWizardOpen(false);
          setWizardLaunchParams(undefined);
        }}
        parts={parts}
        onNavigate={handleDeepNavigate}
        onGlobalRefresh={loadAllData}
        initialScenarioId={wizardLaunchParams?.scenarioId}
        initialPartQuery={wizardLaunchParams?.partQuery}
        initialQty={wizardLaunchParams?.quantity}
        autoEvaluate={wizardLaunchParams?.autoEvaluate}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErpRouterProvider>
      <EnterpriseUxProvider>
        <AppContent />
      </EnterpriseUxProvider>
    </ErpRouterProvider>
  );
}

