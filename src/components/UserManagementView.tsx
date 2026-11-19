import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  Lock,
  UserCheck,
  Building,
  KeyRound,
  Database,
  Terminal,
  Server,
  Layers,
  Code,
  AlertCircle,
  Copy,
  Check,
  CloudUpload,
  CloudDownload,
  GitBranch,
  RefreshCw,
  Laptop,
  UserPlus,
  Edit3,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { UserRoleProfile } from '../types/inventory';
import { CloudSyncCheckResult } from '../types/dbSync';
import { toPersianDigits } from '../utils/formatters';
import { KpiCardsSkeleton } from './ui/Skeleton';
import { useEnterpriseUx } from '../context/EnterpriseUxContext';
import {
  clearSavedDbConnectionUrl,
  isMaskedDbUrl,
  isSameDbEndpointIgnoringPassword,
  loadSavedDbConnectionSettings,
  loadSavedDbConnectionSettingsAsync,
  saveDbConnectionSettings,
  syncSavedDbSettingsWithBackend,
} from '../utils/dbConnectionStorage';
import {
  CustomFactoryUser,
  DEFAULT_ROLE_TITLES,
  deleteCustomUser,
  loadCustomRoleTitles,
  loadCustomUsers,
  saveCustomRoleTitles,
  setActiveFactoryUser,
  upsertCustomUser,
} from '../utils/userDirectoryStorage';

interface UserManagementViewProps {
  currentUser: UserRoleProfile;
  onRoleChange: (role: UserRoleProfile['role']) => void;
  onSelectUser?: (uid: string) => void;
  firebaseUser: any;
  initialSubTab?: 'rbac' | 'db_architecture';
  onSubTabChange?: (sub: 'rbac' | 'db_architecture') => void;
  cloudSyncCheck?: CloudSyncCheckResult | null;
  autoCheckCloudUpdates?: boolean;
  cloudCheckIntervalSec?: number;
  cloudSyncBusy?: 'CHECK' | 'PUSH' | 'PULL' | null;
  onToggleAutoCloudCheck?: (enabled: boolean, intervalSec?: number) => Promise<void>;
  onCheckCloudUpdates?: (force?: boolean) => Promise<void>;
  onCloudPush?: (deviceLabel?: string) => Promise<void>;
  onCloudPull?: () => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  onRoleChange,
  onSelectUser,
  firebaseUser: _firebaseUser,
  initialSubTab = 'rbac',
  onSubTabChange,
  cloudSyncCheck,
  autoCheckCloudUpdates = false,
  cloudCheckIntervalSec = 120,
  cloudSyncBusy = null,
  onToggleAutoCloudCheck,
  onCheckCloudUpdates,
  onCloudPush,
  onCloudPull,
  onRefreshData,
}) => {
  const { requestConfirm } = useEnterpriseUx();
  const [activeSubTab, setActiveSubTab] = useState<'rbac' | 'db_architecture'>(initialSubTab);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDb, setLoadingDb] = useState<boolean>(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Customizable Real Factory Users & Access Level Titles
  const [customUsers, setCustomUsers] = useState<CustomFactoryUser[]>(() => loadCustomUsers());
  const [roleTitles, setRoleTitles] = useState<Record<UserRoleProfile['role'], string>>(() =>
    loadCustomRoleTitles()
  );
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formRole, setFormRole] = useState<UserRoleProfile['role']>('PRODUCTION_MANAGER');
  const [userFeedback, setUserFeedback] = useState<string | null>(null);
  const [editingRoleKey, setEditingRoleKey] = useState<UserRoleProfile['role'] | null>(null);
  const [editingRoleDraft, setEditingRoleDraft] = useState('');

  useEffect(() => {
    const sync = () => {
      setCustomUsers(loadCustomUsers());
      setRoleTitles(loadCustomRoleTitles());
    };
    window.addEventListener('kpims-users-updated', sync);
    return () => window.removeEventListener('kpims-users-updated', sync);
  }, []);

  // Dual DB Connection & Git-Style Sync State (pre-filled synchronously from browser storage)
  const [initialSavedCfg] = useState(() => loadSavedDbConnectionSettings());
  const [localDbUrl, setLocalDbUrl] = useState(initialSavedCfg.localDbUrl);
  const [cloudDbUrl, setCloudDbUrl] = useState(initialSavedCfg.cloudDbUrl);
  const [activeTarget, setActiveTarget] = useState<'AUTO' | 'LOCAL' | 'CLOUD' | 'HYBRID_DISK'>(
    initialSavedCfg.activeTarget || 'AUTO',
  );
  const [deviceLabel, setDeviceLabel] = useState(initialSavedCfg.deviceLabel);
  const [autoCheckPref, setAutoCheckPref] = useState<boolean>(
    initialSavedCfg.updatedAt ? initialSavedCfg.autoCheckCloudUpdates : autoCheckCloudUpdates,
  );
  const [checkIntervalPref, setCheckIntervalPref] = useState<number>(
    initialSavedCfg.updatedAt ? initialSavedCfg.cloudCheckIntervalSec : cloudCheckIntervalSec,
  );
  const [hasBrowserSavedLocal, setHasBrowserSavedLocal] = useState<boolean>(Boolean(initialSavedCfg.localDbUrl));
  const [hasBrowserSavedCloud, setHasBrowserSavedCloud] = useState<boolean>(Boolean(initialSavedCfg.cloudDbUrl));
  const [savingDbCfg, setSavingDbCfg] = useState(false);
  const [testingTarget, setTestingTarget] = useState<'LOCAL' | 'CLOUD' | null>(null);
  const [syncingDb, setSyncingDb] = useState(false);
  const [localGitBusy, setLocalGitBusy] = useState<'CHECK' | 'PUSH' | 'PULL' | null>(null);
  const [localCheckOverride, setLocalCheckOverride] = useState<CloudSyncCheckResult | null>(null);
  const [dbFeedback, setDbFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [localTestResult, setLocalTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [cloudTestResult, setCloudTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [smartSyncBusy, setSmartSyncBusy] = useState(false);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setAutoCheckPref(autoCheckCloudUpdates);
  }, [autoCheckCloudUpdates]);

  useEffect(() => {
    setCheckIntervalPref(cloudCheckIntervalSec);
  }, [cloudCheckIntervalSec]);

  const selectSubTab = (sub: 'rbac' | 'db_architecture') => {
    setActiveSubTab(sub);
    onSubTabChange?.(sub);
    if (sub === 'db_architecture') {
      fetchDbStatus(true);
    }
  };

  const fetchDbStatus = async (probe = false) => {
    setLoadingDb(true);
    try {
      const saved = await loadSavedDbConnectionSettingsAsync();
      setHasBrowserSavedLocal(Boolean(saved.localDbUrl));
      setHasBrowserSavedCloud(Boolean(saved.cloudDbUrl));

      const res = await fetch(`/api/db/status${probe ? '?probe=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        setDbStatus(data);
        const dual = data.data?.dualLinks;
        if (dual) {
          // Never clobber an unmasked browser-stored URL with a masked `:****@` URL from the backend
          if (
            saved.localDbUrl &&
            (!dual.localDbUrlMasked || isSameDbEndpointIgnoringPassword(saved.localDbUrl, dual.localDbUrlMasked))
          ) {
            setLocalDbUrl(saved.localDbUrl);
          } else {
            setLocalDbUrl(prev => (prev && !isMaskedDbUrl(prev) ? prev : dual.localDbUrlMasked || ''));
          }

          if (
            saved.cloudDbUrl &&
            (!dual.cloudDbUrlMasked || isSameDbEndpointIgnoringPassword(saved.cloudDbUrl, dual.cloudDbUrlMasked))
          ) {
            setCloudDbUrl(saved.cloudDbUrl);
          } else {
            setCloudDbUrl(prev => (prev && !isMaskedDbUrl(prev) ? prev : dual.cloudDbUrlMasked || ''));
          }

          setActiveTarget(saved.updatedAt ? saved.activeTarget : dual.activeTarget || 'AUTO');
          if (saved.deviceLabel || dual.deviceLabel) {
            setDeviceLabel(saved.deviceLabel || dual.deviceLabel);
          }
          if (typeof dual.autoCheckCloudUpdates === 'boolean' && !saved.updatedAt) {
            setAutoCheckPref(dual.autoCheckCloudUpdates);
          }
          if (typeof dual.cloudCheckIntervalSec === 'number' && !saved.updatedAt) {
            setCheckIntervalPref(dual.cloudCheckIntervalSec);
          }
        }
      }
    } catch {
      // ignore fetch error on mount
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const idbSaved = await loadSavedDbConnectionSettingsAsync();
      if (active) {
        if (idbSaved.localDbUrl) {
          setLocalDbUrl(prev => prev || idbSaved.localDbUrl);
          setHasBrowserSavedLocal(true);
        }
        if (idbSaved.cloudDbUrl) {
          setCloudDbUrl(prev => prev || idbSaved.cloudDbUrl);
          setHasBrowserSavedCloud(true);
        }
        if (idbSaved.deviceLabel) setDeviceLabel(prev => prev || idbSaved.deviceLabel);
      }
      await syncSavedDbSettingsWithBackend().catch(() => null);
      if (active) {
        await fetchDbStatus(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSaveDualDbConfig = async () => {
    setSavingDbCfg(true);
    setDbFeedback(null);
    try {
      const nextSaved = saveDbConnectionSettings(
        {
          localDbUrl,
          cloudDbUrl,
          activeTarget,
          deviceLabel: deviceLabel.trim(),
          autoCheckCloudUpdates: autoCheckPref,
          cloudCheckIntervalSec: checkIntervalPref,
        },
        {
          allowClearLocal: !localDbUrl.trim(),
          allowClearCloud: !cloudDbUrl.trim(),
        },
      );
      setHasBrowserSavedLocal(Boolean(nextSaved.localDbUrl));
      setHasBrowserSavedCloud(Boolean(nextSaved.cloudDbUrl));

      const res = await fetch('/api/db/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localDbUrl,
          cloudDbUrl,
          activeTarget,
          autoCheckCloudUpdates: autoCheckPref,
          cloudCheckIntervalSec: checkIntervalPref,
          deviceLabel: deviceLabel.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در ذخیره تنظیمات دو پایگاه داده');
      }
      if (onToggleAutoCloudCheck) {
        await onToggleAutoCloudCheck(autoCheckPref, checkIntervalPref);
      }
      setDbFeedback({
        ok: true,
        text: `${json.message || 'تنظیمات دو پایگاه داده ذخیره شد.'} (تنظیمات و لینک‌ها در حافظه مرورگر نیز ذخیره شدند تا در ورودهای بعدی به‌صورت خودکار پر شوند.)`,
      });
      await fetchDbStatus(false);
      if (onCheckCloudUpdates) {
        onCheckCloudUpdates(true).catch(() => {});
      } else {
        fetch('/api/db/sync/check?force=true')
          .then(r => r.json())
          .then(chk => {
            if (chk?.success && chk.data) setLocalCheckOverride(chk.data);
          })
          .catch(() => {});
      }
    } catch (err) {
      setDbFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات پایگاه داده',
      });
    } finally {
      setSavingDbCfg(false);
    }
  };

  const handleTestSingleDb = async (target: 'LOCAL' | 'CLOUD') => {
    setTestingTarget(target);
    const url = target === 'LOCAL' ? localDbUrl : cloudDbUrl;
    try {
      const res = await fetch('/api/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, url, persistOnSuccess: true }),
      });
      const json = await res.json();
      const result = { ok: Boolean(json.success), message: json.message || json.error || 'نتیجه نامشخص' };
      if (target === 'LOCAL') {
        setLocalTestResult(result);
        if (result.ok && url.trim() && !isMaskedDbUrl(url)) {
          const nextSaved = saveDbConnectionSettings({ localDbUrl: url.trim() });
          setHasBrowserSavedLocal(Boolean(nextSaved.localDbUrl));
        }
      } else {
        setCloudTestResult(result);
        if (result.ok && url.trim() && !isMaskedDbUrl(url)) {
          const nextSaved = saveDbConnectionSettings({ cloudDbUrl: url.trim() });
          setHasBrowserSavedCloud(Boolean(nextSaved.cloudDbUrl));
        }
        if (result.ok) {
          onCheckCloudUpdates?.(true);
        }
      }
      if (result.ok) {
        await fetchDbStatus(true);
      }
    } catch (err) {
      const result = { ok: false, message: err instanceof Error ? err.message : 'خطا در تست اتصال' };
      if (target === 'LOCAL') setLocalTestResult(result);
      else setCloudTestResult(result);
    } finally {
      setTestingTarget(null);
    }
  };

  const handleSmartOneClickSync = async () => {
    setSmartSyncBusy(true);
    setDbFeedback(null);
    try {
      const checkRes = await fetch('/api/db/sync/check?force=true');
      const checkJson = await checkRes.json();
      if (!checkRes.ok || !checkJson.success || !checkJson.data) {
        throw new Error(checkJson.error || 'خطا در بررسی وضعیت همگام‌سازی آنلاین');
      }
      const status: CloudSyncCheckResult = checkJson.data;
      setLocalCheckOverride(status);

      if (status.state === 'CLOUD_NOT_CONFIGURED' || status.state === 'CLOUD_UNREACHABLE') {
        setDbFeedback({ ok: false, text: status.messageFa });
        return;
      }

      if (status.state === 'IN_SYNC') {
        setDbFeedback({
          ok: true,
          text: `پایگاه داده محلی و آنلاین کاملاً همگام هستند (Rev #${toPersianDigits(status.localRevision)}). نیازی به تغییر نیست.`,
        });
        await onCheckCloudUpdates?.(true);
        return;
      }

      if (status.state === 'REMOTE_AHEAD') {
        await handleGitAction('PULL');
        return;
      }

      if (status.state === 'LOCAL_AHEAD' || status.state === 'CLOUD_EMPTY') {
        await handleGitAction('PUSH');
        return;
      }

      // DIVERGED: let operator choose explicitly rather than guessing
      setDbFeedback({
        ok: false,
        text: 'تغییرات جدید در هر دو سیستم وجود دارد (DIVERGED). لطفاً دقیقاً یکی از دکمه‌های Pull (دریافت نسخه آنلاین) یا Push (ارسال نسخه این سیستم) را بزنید.',
      });
    } catch (err) {
      setDbFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'خطا در همگام‌سازی یک‌کلیک',
      });
    } finally {
      setSmartSyncBusy(false);
    }
  };

  const executeSyncToActiveDb = async () => {
    setSyncingDb(true);
    setDbFeedback(null);
    try {
      const res = await fetch('/api/db/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'خطا در همگام‌سازی داده‌ها');
      setDbFeedback({ ok: true, text: json.message });
      await fetchDbStatus(false);
    } catch (err) {
      setDbFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'خطا در همگام‌سازی داده‌ها',
      });
    } finally {
      setSyncingDb(false);
    }
  };

  const handleSyncToActiveDb = () => {
    requestConfirm({
      title: 'ذخیره و همگام‌سازی داده‌ها در پایگاه داده فعال',
      message: 'آیا مطمئن هستید که می‌خواهید داده‌های جاری برنامه در پایگاه داده فعال PostgreSQL نوشته شوند؟',
      confirmLabel: 'تأیید و ذخیره در دیتابیس',
      variant: 'warning',
      onConfirm: executeSyncToActiveDb,
    });
  };

  const executeGitAction = async (mode: 'CHECK' | 'PUSH' | 'PULL') => {
    setDbFeedback(null);
    if (mode === 'CHECK' && onCheckCloudUpdates) {
      await onCheckCloudUpdates(true);
      await fetchDbStatus(false);
      return;
    }
    if (mode === 'PUSH' && onCloudPush) {
      await onCloudPush(deviceLabel.trim() || undefined);
      await fetchDbStatus(false);
      return;
    }
    if (mode === 'PULL' && onCloudPull) {
      await onCloudPull();
      await fetchDbStatus(false);
      return;
    }

    setLocalGitBusy(mode);
    try {
      if (mode === 'CHECK') {
        const res = await fetch('/api/db/sync/check?force=true');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'خطا در بررسی نسخه آنلاین');
        setLocalCheckOverride(json.data);
        setDbFeedback({ ok: true, text: json.data?.messageFa || 'بررسی انجام شد.' });
      } else if (mode === 'PUSH') {
        const res = await fetch('/api/db/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceLabel: deviceLabel.trim() || undefined }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'خطا در آپلود به دیتابیس آنلاین');
        if (json.checkResult) setLocalCheckOverride(json.checkResult);
        setDbFeedback({ ok: !json.relationalSyncWarning, text: json.message });
        await fetchDbStatus(false);
      } else if (mode === 'PULL') {
        const res = await fetch('/api/db/sync/pull', { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'خطا در به‌روزرسانی از دیتابیس آنلاین');
        if (json.checkResult) setLocalCheckOverride(json.checkResult);
        const warnText = json.localPgWarning ? ` (هشدار دیتابیس محلی: ${json.localPgWarning})` : '';
        setDbFeedback({ ok: true, text: `${json.message}${warnText}` });
        await onRefreshData?.();
        window.dispatchEvent(new CustomEvent('kpims-master-data-updated', { detail: { type: 'CLOUD_PULL' } }));
        await fetchDbStatus(false);
      }
    } catch (err) {
      setDbFeedback({ ok: false, text: err instanceof Error ? err.message : 'خطا در عملیات همگام‌سازی' });
    } finally {
      setLocalGitBusy(null);
    }
  };

  const handleGitAction = (mode: 'CHECK' | 'PUSH' | 'PULL') => {
    if (mode === 'CHECK') {
      void executeGitAction('CHECK');
      return;
    }
    requestConfirm({
      title:
        mode === 'PUSH'
          ? 'تأیید آپلود کامل داده‌های این سیستم به دیتابیس آنلاین (Push ↑)'
          : 'تأیید به‌روزرسانی دیتابیس محلی از نسخه آنلاین (Pull ↓)',
      message:
        mode === 'PUSH'
          ? 'آیا مطمئن هستید که می‌خواهید داده‌های فعلی این سیستم روی دیتابیس آنلاین آپلود و به‌عنوان آخرین نسخه ثبت شود؟'
          : 'آیا مطمئن هستید که می‌خواهید دیتابیس محلی این سیستم مطابق آخرین نسخه آنلاین بازنویسی و همگام‌سازی شود؟',
      confirmLabel: mode === 'PUSH' ? 'تأیید و Push به آنلاین' : 'تأیید و Pull از آنلاین',
      variant: mode === 'PULL' ? 'warning' : 'indigo',
      onConfirm: async () => {
        await executeGitAction(mode);
      },
    });
  };

  const activeSyncCheck = localCheckOverride || cloudSyncCheck || null;
  const activeGitBusy = cloudSyncBusy || localGitBusy;

  if (loadingDb && !dbStatus) {
    return <KpiCardsSkeleton count={6} columns={6} theme="light" />;
  }

  const rolesInfo: {
    role: UserRoleProfile['role'];
    title: string;
    description: string;
    permissions: string[];
    color: string;
  }[] = [
    {
      role: 'ADMIN',
      title: roleTitles.ADMIN || DEFAULT_ROLE_TITLES.ADMIN,
      description: 'دسترسی نامحدود به تمامی ماژول‌ها، تعریف کاربران، ابطال اسناد، پاکسازی داده‌ها و کالیبراسیون انبارگردانی',
      permissions: ['صدور کلیه اسناد', 'ابطال و صدور سند معکوس', 'تعریف قطعه و مسیر', 'تعریف ماشین‌آلات', 'پاکسازی امن دمو', 'مدیریت کاربران'],
      color: 'border-[#f9d6a7] bg-[#fff4e5] text-[#e9730c]',
    },
    {
      role: 'PRODUCTION_MANAGER',
      title: roleTitles.PRODUCTION_MANAGER || DEFAULT_ROLE_TITLES.PRODUCTION_MANAGER,
      description: 'نظارت بر ایستگاه‌های پرسکاری و جوش، تعریف مسیرهای تولید، کنترل گلوگاه‌ها و مانیتورینگ WIP',
      permissions: ['ثبت تولید سالم', 'ثبت انتقال بین مراحل', 'تعریف و اصلاح مسیر تولید', 'گزارش‌گیری کامل WIP', 'مشاهده ماشین‌آلات'],
      color: 'border-[#b3ddf2] bg-[#e5f3fa] text-[#007cc0]',
    },
    {
      role: 'WAREHOUSE_KEEPER',
      title: roleTitles.WAREHOUSE_KEEPER || DEFAULT_ROLE_TITLES.WAREHOUSE_KEEPER,
      description: 'مدیریت کویل‌ها و شیت‌های ورودی، صدور رسید بارنامه، حواله خروج به خطوط برش و انبار محصول نهایی',
      permissions: ['صدور رسید ورود ورق و قطعات', 'صدور حواله مصرف مواد اولیه', 'انبارگردانی اول دوره', 'مشاهده موجودی انبار مواد و محصول'],
      color: 'border-[#a9dfbf] bg-[#ebf7ef] text-[#107e3e]',
    },
    {
      role: 'LINE_SUPERVISOR',
      title: roleTitles.LINE_SUPERVISOR || DEFAULT_ROLE_TITLES.LINE_SUPERVISOR,
      description: 'ثبت تیراژ شیفت، تخصیص اپراتورها و ماشین‌آلات، صدور کارت انتقال قطعه (کانبان) و تحویل در ایستگاه‌ها',
      permissions: ['ثبت تولید شیفت', 'ثبت خروج و ورود بین مراحل', 'مشاهده موجودی لحظه‌ای ایستگاه', 'تغییر وضعیت آمادگی ماشین'],
      color: 'border-[#d9d9d9] bg-[#f5f5f5] text-[#333333]',
    },
    {
      role: 'QC_INSPECTOR',
      title: roleTitles.QC_INSPECTOR || DEFAULT_ROLE_TITLES.QC_INSPECTOR,
      description: 'بازرسی ابعادی و متالورژی، کنترل پیچش مهره جوش، تست رنگ و ثبت ضایعات با کد علت نقص',
      permissions: ['ثبت ضایعات قطعات', 'ثبت علل عیوب قالب و کشش', 'مشاهده گزارش نرخ ضایعات', 'دسترسی فقط‌خواندنی به کاتالوگ'],
      color: 'border-[#f5b7b1] bg-[#ffecec] text-[#bb0000]',
    },
  ];

  const openAddUserForm = () => {
    setEditingUid(null);
    setFormDisplayName('');
    setFormJobTitle('');
    setFormDepartment('');
    setFormRole('PRODUCTION_MANAGER');
    setUserFormOpen(true);
  };

  const openEditUserForm = (u: CustomFactoryUser) => {
    setEditingUid(u.uid);
    setFormDisplayName(u.displayName);
    setFormJobTitle(u.jobTitle || '');
    setFormDepartment(u.department || '');
    setFormRole(u.role);
    setUserFormOpen(true);
  };

  const handleSaveUserForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formDisplayName.trim();
    if (!trimmedName) return;

    const uid = editingUid || `USR-${Date.now().toString(36).toUpperCase()}`;
    const updatedList = upsertCustomUser({
      uid,
      displayName: trimmedName,
      jobTitle: formJobTitle.trim() || undefined,
      department: formDepartment.trim() || undefined,
      email: `${uid.toLowerCase()}@factory.local`,
      role: formRole,
      active: true,
      createdAt: new Date().toISOString(),
    });
    setCustomUsers(updatedList);
    if (!editingUid || currentUser.uid === uid) {
      if (onSelectUser) {
        onSelectUser(uid);
      } else {
        setActiveFactoryUser(uid);
      }
    }
    setUserFormOpen(false);
    setEditingUid(null);
    setUserFeedback(
      editingUid
        ? `مشخصات کاربر «${trimmedName}» با موفقیت به‌روزرسانی شد.`
        : `کاربر جدید «${trimmedName}» به فهرست کارخانه اضافه و فعال شد.`
    );
    setTimeout(() => setUserFeedback(null), 4000);
  };

  const handleDeleteUser = (u: CustomFactoryUser) => {
    if (customUsers.length <= 1) return;
    requestConfirm({
      title: `حذف کاربر «${u.displayName}»`,
      message: 'آیا از حذف این کاربر از فهرست کاربران کارخانه اطمینان دارید؟',
      confirmLabel: 'بله، حذف کاربر',
      cancelLabel: 'انصراف',
      variant: 'danger',
      onConfirm: () => {
        const updated = deleteCustomUser(u.uid);
        setCustomUsers(updated);
        setUserFeedback(`کاربر «${u.displayName}» از فهرست حذف شد.`);
        setTimeout(() => setUserFeedback(null), 4000);
      },
    });
  };

  const handleActivateUser = (uid: string) => {
    if (onSelectUser) {
      onSelectUser(uid);
    } else {
      setActiveFactoryUser(uid);
    }
  };

  const handleSaveRoleTitle = (roleKey: UserRoleProfile['role']) => {
    const clean = editingRoleDraft.trim();
    if (!clean) return;
    const nextTitles = saveCustomRoleTitles({ ...roleTitles, [roleKey]: clean });
    setRoleTitles(nextTitles);
    setEditingRoleKey(null);
    setUserFeedback(`عنوان سطح دسترسی به «${clean}» تغییر یافت.`);
    setTimeout(() => setUserFeedback(null), 3500);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Unified Light Header & Dropdown List Selector */}
      <div className="sap-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] flex items-center justify-center text-[#007cc0] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#333333]">
                تنظیمات سیستم، هویت کاربران و پایگاه داده (KPIMS Core)
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                مدیریت سطوح دسترسی بر پایه نقش (RBAC)، معماری پایگاه داده PostgreSQL و پیکربندی Prisma ORM
              </p>
            </div>
          </div>
        </div>

        {/* Unified Dropdown List Selector + Quick Chips */}
        <div className="pt-3 border-t border-[#e8e8e8] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-[#f5f5f5] border border-[#d9d9d9] rounded-sm px-3 py-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
              <span className="text-[11px] font-semibold text-[#666666] whitespace-nowrap">
                انتخاب بخش تنظیمات:
              </span>
              <select
                value={activeSubTab}
                onChange={e => selectSubTab(e.target.value as 'rbac' | 'db_architecture')}
                className="bg-transparent text-xs font-bold text-[#333333] focus:outline-none cursor-pointer pr-1 pl-4 py-0.5"
              >
                <option value="rbac">۱. کاربران و سطوح دسترسی کارخانه (RBAC)</option>
                <option value="db_architecture">۲. تنظیمات اتصال دو پایگاه داده (محلی + ابری) & Prisma</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => selectSubTab('rbac')}
                className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold transition cursor-pointer ${
                  activeSubTab === 'rbac'
                    ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]'
                    : 'bg-[#ffffff] text-[#333333] border border-[#d9d9d9] hover:bg-[#f5f5f5]'
                }`}
              >
                کاربران و دسترسی‌ها
              </button>
              <button
                onClick={() => selectSubTab('db_architecture')}
                className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold transition cursor-pointer ${
                  activeSubTab === 'db_architecture'
                    ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]'
                    : 'bg-[#ffffff] text-[#333333] border border-[#d9d9d9] hover:bg-[#f5f5f5]'
                }`}
              >
                لینک دو پایگاه داده (محلی و ابری) & Prisma
              </button>
            </div>
          </div>
        </div>
      </div>

      {activeSubTab === 'rbac' ? (
        <div className="space-y-4">
          {/* Active Profile Bar */}
          <div className="sap-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#007cc0] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {currentUser.displayName ? currentUser.displayName[0] : 'ک'}
              </div>
              <div>
                <div className="text-sm font-bold text-[#333333] flex items-center gap-2 flex-wrap">
                  <span>کاربر فعال نشست: {currentUser.displayName}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]">
                    ورود مستقیم بدون رمز عبور
                  </span>
                </div>
                <div className="text-xs text-[#666666] mt-0.5">
                  سطح دسترسی فعال:{' '}
                  <span className="text-[#007cc0] font-bold">
                    {roleTitles[currentUser.role] || DEFAULT_ROLE_TITLES[currentUser.role]}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {customUsers.find(u => u.uid === currentUser.uid) && (
                <button
                  type="button"
                  onClick={() => {
                    const activeObj = customUsers.find(u => u.uid === currentUser.uid);
                    if (activeObj) openEditUserForm(activeObj);
                  }}
                  className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#007cc0]" />
                  <span>ویرایش نام کاربر فعال</span>
                </button>
              )}
              <button
                type="button"
                onClick={openAddUserForm}
                className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>افزودن کاربر واقعی جدید</span>
              </button>
            </div>
          </div>

          {userFeedback && (
            <div className="bg-[#ebf7ef] border border-[#a9dfbf] text-[#107e3e] text-xs p-3 rounded-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{userFeedback}</span>
            </div>
          )}

          {/* Add / Edit Real Factory User Form */}
          {userFormOpen && (
            <form
              onSubmit={handleSaveUserForm}
              className="sap-card p-4 border-[#007cc0] bg-[#f7fbff] space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[#d9e9f5] pb-2">
                <span className="text-xs font-bold text-[#004e7a] flex items-center gap-1.5">
                  {editingUid ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {editingUid ? 'ویرایش مشخصات و نام واقعی کاربر' : 'تعریف کاربر واقعی جدید در کارخانه'}
                </span>
                <button
                  type="button"
                  onClick={() => setUserFormOpen(false)}
                  className="text-[#666666] hover:text-[#333333] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-[#333333] mb-1">
                    نام و نام خانوادگی واقعی *
                  </label>
                  <input
                    type="text"
                    required
                    value={formDisplayName}
                    onChange={e => setFormDisplayName(e.target.value)}
                    placeholder="نام واقعی همکار را وارد کنید..."
                    className="w-full px-2.5 py-1.5 bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#333333] mb-1">
                    سمت شغلی (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={formJobTitle}
                    onChange={e => setFormJobTitle(e.target.value)}
                    placeholder="مثلاً: مدیر تولید، انباردار..."
                    className="w-full px-2.5 py-1.5 bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#333333] mb-1">
                    واحد / سالن (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={e => setFormDepartment(e.target.value)}
                    placeholder="مثلاً: سالن پرس ۱، انبار مرکزی..."
                    className="w-full px-2.5 py-1.5 bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#333333] mb-1">
                    سطح دسترسی (نقش) *
                  </label>
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value as UserRoleProfile['role'])}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#bfbfbf] rounded-sm font-semibold focus:outline-none focus:border-[#007cc0] cursor-pointer"
                  >
                    {rolesInfo.map(r => (
                      <option key={r.role} value={r.role}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setUserFormOpen(false)}
                  className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingUid ? 'ذخیره تغییرات کاربر' : 'ثبت و فعال‌سازی کاربر'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Real Factory Users Table */}
          <div className="sap-card overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f7f9fb] border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-[#333333]">
                  فهرست کاربران کارخانه ({toPersianDigits(customUsers.length)} نفر)
                </h3>
                <p className="text-[11px] text-[#666666]">
                  نام، سمت و سطح دسترسی هر فرد را مستقیماً شخصی‌سازی کنید. سیستم پسورد فعلاً غیرفعال است و انتخاب کاربر بلافاصله نشست را تغییر می‌دهد.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead className="bg-white border-b border-[#d9d9d9] text-[#555555]">
                  <tr>
                    <th className="py-2 px-3">نام و نام خانوادگی</th>
                    <th className="py-2 px-3">سمت و واحد</th>
                    <th className="py-2 px-3">سطح دسترسی</th>
                    <th className="py-2 px-3 w-28">وضعیت نشست</th>
                    <th className="py-2 px-3 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eeeeee]">
                  {customUsers.map(u => {
                    const isActive = currentUser.uid === u.uid;
                    const roleMeta = rolesInfo.find(r => r.role === u.role);
                    return (
                      <tr
                        key={u.uid}
                        className={isActive ? 'bg-[#f4f9fd]' : 'hover:bg-[#fafafa]'}
                      >
                        <td className="py-2 px-3 font-bold text-[#333333]">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full text-[11px] flex items-center justify-center font-bold shrink-0 ${
                              isActive ? 'bg-[#007cc0] text-white' : 'bg-[#e8edf2] text-[#333333]'
                            }`}>
                              {u.displayName ? u.displayName[0] : 'ک'}
                            </span>
                            <span>{u.displayName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {[u.jobTitle, u.department].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${
                            roleMeta?.color || 'border-[#d9d9d9] bg-[#f5f5f5] text-[#333333]'
                          }`}>
                            {roleTitles[u.role] || DEFAULT_ROLE_TITLES[u.role]}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#107e3e]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              کاربر فعال
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#888888]">آماده انتخاب</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => handleActivateUser(u.uid)}
                                className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold text-[#007cc0] cursor-pointer"
                              >
                                فعال‌سازی این کاربر
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditUserForm(u)}
                              className="sap-btn-standard px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer"
                              title="ویرایش نام و سطح دسترسی"
                            >
                              <Edit3 className="w-3 h-3 text-[#007cc0]" />
                              <span>ویرایش</span>
                            </button>
                            {customUsers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-2 py-1 rounded border border-[#f5b8b8] bg-[#fde8e8] hover:bg-[#fbd0d0] text-[#bb0000] text-[11px] flex items-center gap-1 cursor-pointer"
                                title="حذف کاربر"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Customizable Access Levels Matrix */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#007cc0]" />
                <span>ماتریس سطوح دسترسی کارخانه (عناوین قابل شخصی‌سازی)</span>
              </h3>
              <span className="text-[11px] text-[#666666]">
                برای تغییر نام هر سطح دسترسی روی دکمه «ویرایش عنوان» کلیک کنید.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {rolesInfo.map(info => {
                const isSelected = currentUser.role === info.role;
                const isEditingTitle = editingRoleKey === info.role;
                return (
                  <div
                    key={info.role}
                    className={`sap-card p-4 flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-[#007cc0] ring-1 ring-[#007cc0]'
                        : 'hover:border-[#bfbfbf]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${info.color}`}>
                          {info.role}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[11px] text-[#007cc0] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            سطح فعال
                          </span>
                        )}
                      </div>

                      {isEditingTitle ? (
                        <div className="flex items-center gap-1.5 mb-2">
                          <input
                            type="text"
                            value={editingRoleDraft}
                            onChange={e => setEditingRoleDraft(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs font-bold bg-white border border-[#007cc0] rounded-sm focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRoleTitle(info.role)}
                            className="sap-btn-emphasized px-2 py-1 text-[11px] cursor-pointer"
                            title="ذخیره عنوان"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRoleKey(null)}
                            className="sap-btn-standard px-1.5 py-1 text-[11px] cursor-pointer"
                            title="انصراف"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <h4 className="text-sm font-bold text-[#333333]">{info.title}</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoleKey(info.role);
                              setEditingRoleDraft(info.title);
                            }}
                            className="text-[10px] text-[#007cc0] hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>ویرایش عنوان</span>
                          </button>
                        </div>
                      )}

                      <p className="text-xs text-[#666666] leading-relaxed mb-3">{info.description}</p>

                      <div className="space-y-1.5 border-t border-[#e8e8e8] pt-3">
                        <div className="text-[11px] font-bold text-[#666666]">مجوزهای عملیاتی:</div>
                        {info.permissions.map((perm, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs text-[#333333]">
                            <CheckCircle2 className="w-3 h-3 text-[#107e3e] shrink-0" />
                            <span>{perm}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRoleChange(info.role)}
                      className={`mt-4 w-full py-1.5 text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'sap-btn-emphasized'
                          : 'sap-btn-standard'
                      }`}
                    >
                      {isSelected ? 'سطح دسترسی کاربر فعال است' : 'تخصیص این سطح دسترسی به کاربر فعال'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Database & Prisma Architecture Documentation */
        <div className="space-y-4">
          {/* Dual Database Links Configuration (Local PostgreSQL + Cloud PostgreSQL) */}
          <div className="sap-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#007cc0]" />
                <div>
                  <h3 className="text-sm font-bold text-[#333333]">
                    مدیریت لینک دو پایگاه داده (Local PostgreSQL + Cloud PostgreSQL)
                  </h3>
                  <p className="text-[11px] text-[#666666]">
                    در سیستم‌ها و سرورهای مختلف، می‌توانید هم لینک پایگاه داده محلی (Local) و هم لینک پایگاه داده ابری (Cloud/Supabase) را تنظیم، تست و سوییچ کنید.
                  </p>
                </div>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-sm font-semibold flex items-center gap-1.5 ${
                  dbStatus?.data?.isConnected
                    ? 'bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]'
                    : 'bg-[#fff4e5] text-[#e9730c] border border-[#f9d6a7]'
                }`}
              >
                {dbStatus?.data?.isConnected ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    متصل ({dbStatus?.data?.dualLinks?.resolvedTarget || 'PostgreSQL'})
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    موتور پایدار دیسک فعال است ({dbStatus?.data?.storageMode || 'HYBRID_DURABLE_DISK'})
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Local Database Link */}
              <div className="p-3.5 bg-[#f7f9fb] border border-[#d9e2ec] rounded-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-[#007cc0]" />
                    ۱. لینک پایگاه داده محلی (Local Server / LAN DB)
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    {hasBrowserSavedLocal && (
                      <span className="text-[#007cc0] bg-[#e5f3fa] border border-[#b3ddf2] px-2 py-0.5 rounded-sm">
                        ذخیره‌شده در مرورگر ✓
                      </span>
                    )}
                    {dbStatus?.data?.dualLinks?.hasLocalDbUrl && (
                      <span className="text-[#107e3e] bg-[#ebf7ef] border border-[#a9dfbf] px-2 py-0.5 rounded-sm">
                        رمز ذخیره شده ✓
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-sm border ${
                      dbStatus?.data?.dualLinks?.localStatus?.isConnected
                        ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                        : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                    }`}>
                      {dbStatus?.data?.dualLinks?.localStatus?.isConnected ? 'متصل' : dbStatus?.data?.dualLinks?.hasLocalDbUrl ? 'ذخیره‌شده' : 'تنظیم‌نشده'}
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={localDbUrl}
                  onChange={e => {
                    const nextVal = e.target.value;
                    setLocalDbUrl(nextVal);
                    if (/^postgres(ql)?:\/\/[^:]+:[^@]+@/.test(nextVal.trim()) && !isMaskedDbUrl(nextVal)) {
                      const nextSaved = saveDbConnectionSettings({ localDbUrl: nextVal.trim() });
                      setHasBrowserSavedLocal(Boolean(nextSaved.localDbUrl));
                    }
                  }}
                  placeholder="postgresql://postgres:password@localhost:5432/kpims_db?schema=public"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTestSingleDb('LOCAL')}
                      disabled={testingTarget === 'LOCAL' || !localDbUrl.trim()}
                      className="sap-btn-standard text-[11px] px-3 py-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {testingTarget === 'LOCAL' ? 'در حال تست محلی...' : 'تست و ذخیره خودکار محلی'}
                    </button>
                    {localDbUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalDbUrl('');
                          setLocalTestResult(null);
                        }}
                        className="text-[11px] text-[#666666] hover:text-[#bb0000] px-2 py-1 cursor-pointer whitespace-nowrap"
                        title="پاک‌کردن فیلد برای وارد کردن لینک جدید"
                      >
                        تغییر لینک
                      </button>
                    )}
                    {hasBrowserSavedLocal && (
                      <button
                        type="button"
                        onClick={() => {
                          clearSavedDbConnectionUrl('LOCAL');
                          setHasBrowserSavedLocal(false);
                          setLocalDbUrl('');
                          setLocalTestResult(null);
                        }}
                        className="text-[11px] text-[#bb0000] hover:underline px-1.5 py-1 cursor-pointer whitespace-nowrap"
                        title="حذف لینک و رمز محلی از حافظه مرورگر"
                      >
                        پاک‌کردن از مرورگر
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[#666666]">مناسب شبکه داخلی کارخانه (ذخیره خودکار در سرور و مرورگر)</span>
                </div>
                {localTestResult && (
                  <div className={`text-[11px] p-2 rounded-sm border ${
                    localTestResult.ok ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                  }`}>
                    {localTestResult.message}
                  </div>
                )}
              </div>

              {/* Cloud Database Link */}
              <div className="p-3.5 bg-[#f7f9fb] border border-[#d9e2ec] rounded-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-[#107e3e]" />
                    ۲. لینک پایگاه داده ابری (Cloud / Supabase Pooler)
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    {hasBrowserSavedCloud && (
                      <span className="text-[#007cc0] bg-[#e5f3fa] border border-[#b3ddf2] px-2 py-0.5 rounded-sm">
                        ذخیره‌شده در مرورگر ✓
                      </span>
                    )}
                    {dbStatus?.data?.dualLinks?.hasCloudDbUrl && (
                      <span className="text-[#107e3e] bg-[#ebf7ef] border border-[#a9dfbf] px-2 py-0.5 rounded-sm">
                        رمز ذخیره شده ✓
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-sm border ${
                      dbStatus?.data?.dualLinks?.cloudStatus?.isConnected
                        ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                        : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                    }`}>
                      {dbStatus?.data?.dualLinks?.cloudStatus?.isConnected ? 'متصل' : dbStatus?.data?.dualLinks?.hasCloudDbUrl ? 'ذخیره‌شده' : 'تنظیم‌نشده'}
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={cloudDbUrl}
                  onChange={e => {
                    const nextVal = e.target.value;
                    setCloudDbUrl(nextVal);
                    if (/^postgres(ql)?:\/\/[^:]+:[^@]+@/.test(nextVal.trim()) && !isMaskedDbUrl(nextVal)) {
                      const nextSaved = saveDbConnectionSettings({ cloudDbUrl: nextVal.trim() });
                      setHasBrowserSavedCloud(Boolean(nextSaved.cloudDbUrl));
                    }
                  }}
                  placeholder="postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:6543/postgres"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTestSingleDb('CLOUD')}
                      disabled={testingTarget === 'CLOUD' || !cloudDbUrl.trim()}
                      className="sap-btn-standard text-[11px] px-3 py-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {testingTarget === 'CLOUD' ? 'در حال تست ابری...' : 'تست و ذخیره خودکار ابری'}
                    </button>
                    {cloudDbUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setCloudDbUrl('');
                          setCloudTestResult(null);
                        }}
                        className="text-[11px] text-[#666666] hover:text-[#bb0000] px-2 py-1 cursor-pointer whitespace-nowrap"
                        title="پاک‌کردن فیلد برای وارد کردن لینک جدید"
                      >
                        تغییر لینک
                      </button>
                    )}
                    {hasBrowserSavedCloud && (
                      <button
                        type="button"
                        onClick={() => {
                          clearSavedDbConnectionUrl('CLOUD');
                          setHasBrowserSavedCloud(false);
                          setCloudDbUrl('');
                          setCloudTestResult(null);
                        }}
                        className="text-[11px] text-[#bb0000] hover:underline px-1.5 py-1 cursor-pointer whitespace-nowrap"
                        title="حذف لینک و رمز ابری از حافظه مرورگر"
                      >
                        پاک‌کردن از مرورگر
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[#666666]">پیشنهاد: Session Pooler سوپابیس (ذخیره خودکار در سرور و مرورگر)</span>
                </div>
                {cloudTestResult && (
                  <div className={`text-[11px] p-2 rounded-sm border ${
                    cloudTestResult.ok ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                  }`}>
                    {cloudTestResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Opt-In Git-Style Auto-Check Preferences + Device Label + Active Target */}
            <div className="p-3.5 bg-[#f7f9fb] border border-[#d9e2ec] rounded-sm space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#333333] flex items-center gap-1.5 mb-1">
                    <Laptop className="w-3.5 h-3.5 text-[#007cc0]" />
                    نام این سیستم / دستگاه (برای تشخیص در تاریخچه آنلاین)
                  </label>
                  <input
                    type="text"
                    value={deviceLabel}
                    onChange={e => {
                      const val = e.target.value;
                      setDeviceLabel(val);
                      saveDbConnectionSettings({ deviceLabel: val });
                    }}
                    placeholder="مثلاً: سیستم واحد تولید یا کامپیوتر انبار"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#333333] block mb-1">
                    اولویت اتصال فعال در این سیستم:
                  </label>
                  <select
                    value={activeTarget}
                    onChange={e => {
                      const val = e.target.value as 'AUTO' | 'LOCAL' | 'CLOUD' | 'HYBRID_DISK';
                      setActiveTarget(val);
                      saveDbConnectionSettings({ activeTarget: val });
                    }}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="AUTO">خودکار (ابتدا محلی، سپس ابری، در صورت قطعی دیسک پایدار)</option>
                    <option value="LOCAL">فقط پایگاه داده محلی (Local DB)</option>
                    <option value="CLOUD">فقط پایگاه داده ابری (Cloud / Supabase DB)</option>
                    <option value="HYBRID_DISK">فقط ذخیره‌سازی دیسک محلی سرور (Hybrid Durable Disk)</option>
                  </select>
                </div>
              </div>

              {/* Opt-in Auto Check Checkbox */}
              <div className="bg-white border border-[#d9d9d9] rounded-sm p-2.5 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCheckPref}
                    onChange={async e => {
                      const next = e.target.checked;
                      setAutoCheckPref(next);
                      saveDbConnectionSettings({ autoCheckCloudUpdates: next });
                      if (onToggleAutoCloudCheck) {
                        await onToggleAutoCloudCheck(next, checkIntervalPref);
                      }
                    }}
                    className="w-4 h-4 mt-0.5 accent-[#007cc0] cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-bold text-[#333333]">
                      بررسی خودکار به‌روزرسانی دیتابیس آنلاین حین اجرا (مثل Git)
                    </div>
                    <div className="text-[11px] text-[#666666]">
                      فقط یک ردیف سبک (کمتر از ۱ کیلوبایت) را بررسی می‌کند و اگر سیستم دیگری (مثلاً لپتاپ) نسخه جدیدتری آپلود کرده باشد هشدار می‌دهد. وقتی تیک خورده نباشد، هیچ درخواست آنلاینی در پس‌زمینه ارسال نمی‌شود.
                    </div>
                  </div>
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-[#666666]">بازه بررسی:</span>
                  <select
                    value={checkIntervalPref}
                    disabled={!autoCheckPref}
                    onChange={async e => {
                      const nextInt = Number(e.target.value);
                      setCheckIntervalPref(nextInt);
                      saveDbConnectionSettings({ cloudCheckIntervalSec: nextInt });
                      if (autoCheckPref && onToggleAutoCloudCheck) {
                        await onToggleAutoCloudCheck(true, nextInt);
                      }
                    }}
                    className="px-2 py-1 text-xs bg-white border border-[#bfbfbf] rounded-sm disabled:opacity-50"
                  >
                    <option value={60}>هر ۱ دقیقه</option>
                    <option value={120}>هر ۲ دقیقه (پیشنهادی)</option>
                    <option value={300}>هر ۵ دقیقه</option>
                    <option value={600}>هر ۱۰ دقیقه</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSaveDualDbConfig}
                    disabled={savingDbCfg}
                    className="sap-btn-emphasized text-xs px-4 py-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingDbCfg ? 'در حال ذخیره...' : 'ذخیره لینک‌ها و تنظیمات اتصال'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncToActiveDb}
                    disabled={syncingDb}
                    className="sap-btn-standard text-xs px-3.5 py-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {syncingDb ? 'در حال همگام‌سازی...' : 'ذخیره داده‌ها در پایگاه داده فعال'}
                  </button>
                </div>
              </div>
            </div>

            {/* Git-Style Push & Pull Synchronization Workflow Box */}
            <div className="p-4 bg-[#f4f8fc] border border-[#b3ddf2] rounded-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-[#007cc0]" />
                  <div>
                    <h4 className="text-xs font-bold text-[#333333]">
                      همگام‌سازی بین لپتاپ و کامپیوتر کارخانه از طریق دیتابیس آنلاین (Push / Pull مثل Git)
                    </h4>
                    <p className="text-[11px] text-[#666666]">
                      روی لپتاپ کار کنید و «Push» بزنید؛ وقتی پشت کامپیوتر کارخانه آمدید، برنامه آپدیت را تشخیص می‌دهد و با «Pull» دیتابیس محلی را دقیقاً منطبق با نسخه آنلاین به‌روزرسانی می‌کند.
                    </p>
                  </div>
                </div>
                {activeSyncCheck && (
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-sm border ${
                      activeSyncCheck.state === 'IN_SYNC'
                        ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                        : activeSyncCheck.state === 'REMOTE_AHEAD'
                        ? 'bg-[#fff4e5] text-[#b45309] border-[#f5cba7]'
                        : activeSyncCheck.state === 'LOCAL_AHEAD'
                        ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]'
                        : activeSyncCheck.state === 'DIVERGED'
                        ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                        : 'bg-white text-[#666666] border-[#d9d9d9]'
                    }`}
                  >
                    {activeSyncCheck.state === 'IN_SYNC'
                      ? 'کاملاً همگام (In Sync)'
                      : activeSyncCheck.state === 'REMOTE_AHEAD'
                      ? 'نسخه جدیدتر در آنلاین موجود است (Pull لازم است)'
                      : activeSyncCheck.state === 'LOCAL_AHEAD'
                      ? 'تغییرات محلی آپلودنشده (Push لازم است)'
                      : activeSyncCheck.state === 'DIVERGED'
                      ? 'تغییرات در هر دو سمت (تضاد نسخه)'
                      : activeSyncCheck.state === 'CLOUD_EMPTY'
                      ? 'دیتابیس آنلاین خالی است'
                      : activeSyncCheck.state === 'CLOUD_UNREACHABLE'
                      ? 'دیتابیس آنلاین در دسترس نیست'
                      : 'لینک آنلاین تنظیم نشده'}
                  </span>
                )}
              </div>

              {activeSyncCheck && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-[#d9d9d9] rounded-sm p-3 space-y-1">
                    <div className="font-bold text-[#333333] flex items-center justify-between">
                      <span>وضعیت فعلی این سیستم ({activeSyncCheck.deviceLabel})</span>
                      <span className="font-mono text-[11px] text-[#666666]">
                        Rev #{toPersianDigits(activeSyncCheck.localRevision)}
                      </span>
                    </div>
                    {activeSyncCheck.localCounts && (
                      <div className="text-[11px] text-[#555555]">
                        {toPersianDigits(activeSyncCheck.localCounts.parts)} قطعه ·{' '}
                        {toPersianDigits(activeSyncCheck.localCounts.manufacturingOrders)} دستور تولید ·{' '}
                        {toPersianDigits(activeSyncCheck.localCounts.inventoryDocs)} سند انبار
                      </div>
                    )}
                    <div className="text-[10px] font-mono text-[#888888]" dir="ltr">
                      hash: {activeSyncCheck.localHash}
                    </div>
                  </div>

                  <div className="bg-white border border-[#d9d9d9] rounded-sm p-3 space-y-1">
                    <div className="font-bold text-[#007cc0] flex items-center justify-between">
                      <span>آخرین نسخه روی دیتابیس آنلاین (Cloud DB)</span>
                      {activeSyncCheck.cloudManifest && (
                        <span className="font-mono text-[11px]">
                          Rev #{toPersianDigits(activeSyncCheck.cloudManifest.revision)}
                        </span>
                      )}
                    </div>
                    {activeSyncCheck.cloudManifest ? (
                      <>
                        <div className="text-[11px] text-[#555555]">
                          آپلودشده از «{activeSyncCheck.cloudManifest.deviceLabel}» در{' '}
                          {new Date(activeSyncCheck.cloudManifest.updatedAt).toLocaleString('fa-IR')}
                        </div>
                        <div className="text-[11px] text-[#555555]">
                          {toPersianDigits(activeSyncCheck.cloudManifest.counts.parts)} قطعه ·{' '}
                          {toPersianDigits(activeSyncCheck.cloudManifest.counts.manufacturingOrders)} دستور تولید ·{' '}
                          {toPersianDigits(activeSyncCheck.cloudManifest.counts.inventoryDocs)} سند انبار
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-[11px] text-[#666666]">{activeSyncCheck.messageFa}</div>
                        {activeSyncCheck.error && (
                          <div className="text-[10px] text-[#bb0000] bg-[#fff5f5] border border-[#f5c6cb] px-2 py-1 rounded-sm">
                            {activeSyncCheck.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSmartOneClickSync}
                  disabled={Boolean(activeGitBusy) || smartSyncBusy}
                  className="sap-btn-emphasized text-xs px-4 py-1.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${smartSyncBusy ? 'animate-spin' : ''}`} />
                  <span>{smartSyncBusy ? 'در حال همگام‌سازی خودکار...' : 'همگام‌سازی هوشمند یک‌کلیک (خودکار)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGitAction('CHECK')}
                  disabled={Boolean(activeGitBusy) || smartSyncBusy}
                  className="sap-btn-standard text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${activeGitBusy === 'CHECK' ? 'animate-spin' : ''}`} />
                  <span>{activeGitBusy === 'CHECK' ? 'در حال بررسی...' : '۱. بررسی نسخه آنلاین (Fetch Check)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGitAction('PUSH')}
                  disabled={Boolean(activeGitBusy) || smartSyncBusy}
                  className="sap-btn-standard text-xs px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer text-[#007cc0] border-[#007cc0] bg-white hover:bg-[#e5f3fa] disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{activeGitBusy === 'PUSH' ? 'در حال آپلود به آنلاین...' : '۲. آپلود از این سیستم به آنلاین (Push ↑)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGitAction('PULL')}
                  disabled={Boolean(activeGitBusy) || smartSyncBusy}
                  className="sap-btn-standard text-xs px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer text-[#107e3e] border-[#107e3e] bg-white hover:bg-[#ebf7ef] disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>{activeGitBusy === 'PULL' ? 'در حال به‌روزرسانی سیستم...' : '۳. دریافت از آنلاین به محلی (Pull ↓)'}</span>
                </button>
              </div>
            </div>

            {dbFeedback && (
              <div className={`text-xs p-3 rounded-sm border flex items-center gap-2 ${
                dbFeedback.ok ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
              }`}>
                {dbFeedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{dbFeedback.text}</span>
              </div>
            )}

            {dbStatus?.data?.dualLinks?.lastSyncAt && (
              <div className="text-[11px] text-[#107e3e] bg-[#f4fbf6] border border-[#c8e6cf] rounded-sm px-3 py-2">
                آخرین همگام‌سازی: {dbStatus.data.dualLinks.lastSyncSummary} ({new Date(dbStatus.data.dualLinks.lastSyncAt).toLocaleString('fa-IR')})
              </div>
            )}

            <p className="text-xs text-[#666666] leading-relaxed">
              {dbStatus?.data?.errorMessage ||
                'سامانه آماده اتصال به PostgreSQL با ORM پریسما است. تمام تراکنش‌ها و اعتبارسنجی‌ها سمت سرور با موتور Zod و کنترل موجودی انجام می‌شوند.'}
            </p>

            <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9] text-xs font-mono text-[#666666] space-y-1.5">
              <div>
                <span className="text-[#666666]">پایگاه داده فعال فعلی: </span>
                <span className="text-[#007cc0] font-bold" dir="ltr">
                  {dbStatus?.data?.databaseUrlMasked || 'HYBRID_DURABLE_DISK'}
                </span>
              </div>
              <div>
                <span className="text-[#666666]">لینک محلی ذخیره‌شده: </span>
                <span className="text-[#333333] font-bold" dir="ltr">
                  {dbStatus?.data?.dualLinks?.localDbUrlMasked || 'تعریف‌نشده'}
                </span>
              </div>
              <div>
                <span className="text-[#666666]">لینک ابری ذخیره‌شده: </span>
                <span className="text-[#107e3e] font-bold" dir="ltr">
                  {dbStatus?.data?.dualLinks?.cloudDbUrlMasked || 'تعریف‌نشده'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Tables Defined */}
          <div className="sap-card p-4">
            <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-[#007cc0]" />
              جداول تعریف‌شده در Prisma Schema (۱۱ جدول تخصصی کارخانه)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {[
                { name: 'users', desc: 'کاربران و ماتریس دسترسی RBAC' },
                { name: 'parts', desc: 'کاتالوگ ۵۲ قطعه، گرید، ضخامت و اوزان' },
                { name: 'factory_halls', desc: 'سالن‌های پرس، جوش، رنگ و مونتاژ' },
                { name: 'machines', desc: 'پرس‌های هیدرولیک و ضربه‌ای چندمنظوره' },
                { name: 'dies_molds', desc: 'قالب‌های سنبه‌ماتریس و عمر ضرب' },
                { name: 'production_routes', desc: 'مسیرهای تولید و ساخت مهندسی' },
                { name: 'route_operations', desc: 'مراحل OP10..OP80 و زمان سیکل' },
                { name: 'inventory_transactions', desc: 'اسناد کاردکس و گردش انبار' },
                { name: 'production_plans', desc: 'برنامه‌های هفتگی و تیراژ مصوب' },
                { name: 'sapco_coils', desc: 'کلاف‌ها، رول‌ها و سهمیه وزنی ساپکو' },
                { name: 'system_audit_logs', desc: 'ثبت وقایع و امنیت سیستم' },
              ].map(tbl => (
                <div key={tbl.name} className="p-2.5 bg-[#f7f7f7] rounded-sm border border-[#d9d9d9]">
                  <span className="font-mono text-[#007cc0] font-bold">{tbl.name}</span>
                  <p className="text-[11px] text-[#666666] mt-0.5">{tbl.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Migration Commands */}
          <div className="sap-card p-4">
            <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-[#107e3e]" />
              دستورات اجرای مایگریشن و مدیریت پایگاه داده (Prisma CLI)
            </h3>
            <p className="text-xs text-[#666666] mb-3">
              پس از مقداردهی متغیر محیطی <code className="text-[#007cc0] font-mono font-bold">DATABASE_URL</code>، می‌توانید از طریق دستورات زیر جداول را در PostgreSQL ایجاد کنید:
            </p>

            <div className="space-y-2 text-xs font-mono">
              {[
                {
                  cmd: 'npx prisma migrate dev --name init',
                  desc: 'ایجاد فایل مایگریشن اولیه و اعمال آن روی PostgreSQL',
                },
                {
                  cmd: 'npx prisma db push',
                  desc: 'همگام‌سازی فوری شمای پریسما با پایگاه داده بدون تولید فایل مایگریشن',
                },
                {
                  cmd: 'npx prisma generate',
                  desc: 'تولید کلاینت تایپ‌اسکریپت پریسما برای مدل‌های جدید',
                },
                {
                  cmd: 'npx prisma studio',
                  desc: 'راه‌اندازی محیط گرافیکی وب برای مشاهده و مدیریت مستقیم جداول',
                },
              ].map(item => (
                <div
                  key={item.cmd}
                  className="flex items-center justify-between p-2.5 bg-[#f7f7f7] rounded-sm border border-[#d9d9d9]"
                >
                  <div>
                    <div className="text-[#107e3e] font-bold">$ {item.cmd}</div>
                    <div className="text-[11px] text-[#666666] font-sans mt-0.5">{item.desc}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(item.cmd)}
                    className="sap-btn-standard p-1.5"
                    title="کپی دستور"
                  >
                    {copiedCmd === item.cmd ? <Check className="w-3.5 h-3.5 text-[#107e3e]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Environment Variables Documentation */}
          <div className="sap-card p-4">
            <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-[#007cc0]" />
              متغیرهای محیطی مورد نیاز سامانه (.env)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sap-table-compact">
                <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9]">
                  <tr>
                    <th>نام متغیر</th>
                    <th>الزامی/اختیاری</th>
                    <th>توضیح و نمونه مقدار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333]">
                  <tr>
                    <td className="font-mono text-[#007cc0] font-bold">DATABASE_URL</td>
                    <td className="text-[#bb0000] font-semibold">الزامی برای PostgreSQL</td>
                    <td className="font-mono text-[11px]">postgresql://user:pass@localhost:5432/kpims_db?schema=public</td>
                  </tr>
                  <tr>
                    <td className="font-mono text-[#007cc0] font-bold">PORT</td>
                    <td className="text-[#666666]">پیش‌فرض ۳۰۰۰</td>
                    <td className="text-[11px]">پورت اجرای وب‌سرور Express Node.js</td>
                  </tr>
                  <tr>
                    <td className="font-mono text-[#007cc0] font-bold">NODE_ENV</td>
                    <td className="text-[#666666]">اختیاری</td>
                    <td className="text-[11px]">development یا production</td>
                  </tr>
                  <tr>
                    <td className="font-mono text-[#007cc0] font-bold">APP_URL</td>
                    <td className="text-[#666666]">خودکار در پلتفرم</td>
                    <td className="text-[11px]">آدرس اصلی هاست برنامه</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
