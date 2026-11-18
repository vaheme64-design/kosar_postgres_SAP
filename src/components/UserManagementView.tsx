import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  Lock,
  UserCheck,
  Building,
  KeyRound,
  LogIn,
  LogOut,
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
} from 'lucide-react';
import { UserRoleProfile } from '../types/inventory';
import { CloudSyncCheckResult } from '../types/dbSync';
import { toPersianDigits } from '../utils/formatters';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { KpiCardsSkeleton } from './ui/Skeleton';
import { InlinePageGuideButton } from './common/PageGuideSystem';

interface UserManagementViewProps {
  currentUser: UserRoleProfile;
  onRoleChange: (role: UserRoleProfile['role']) => void;
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
  firebaseUser,
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
  const [activeSubTab, setActiveSubTab] = useState<'rbac' | 'db_architecture'>(initialSubTab);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDb, setLoadingDb] = useState<boolean>(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Dual DB Connection & Git-Style Sync State
  const [localDbUrl, setLocalDbUrl] = useState('');
  const [cloudDbUrl, setCloudDbUrl] = useState('');
  const [activeTarget, setActiveTarget] = useState<'AUTO' | 'LOCAL' | 'CLOUD' | 'HYBRID_DISK'>('AUTO');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [autoCheckPref, setAutoCheckPref] = useState<boolean>(autoCheckCloudUpdates);
  const [checkIntervalPref, setCheckIntervalPref] = useState<number>(cloudCheckIntervalSec);
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
      const res = await fetch(`/api/db/status${probe ? '?probe=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        setDbStatus(data);
        const dual = data.data?.dualLinks;
        if (dual) {
          setLocalDbUrl(dual.localDbUrlMasked || '');
          setCloudDbUrl(dual.cloudDbUrlMasked || '');
          setActiveTarget(dual.activeTarget || 'AUTO');
          if (dual.deviceLabel) setDeviceLabel(dual.deviceLabel);
          if (typeof dual.autoCheckCloudUpdates === 'boolean') setAutoCheckPref(dual.autoCheckCloudUpdates);
          if (typeof dual.cloudCheckIntervalSec === 'number') setCheckIntervalPref(dual.cloudCheckIntervalSec);
        }
      }
    } catch {
      // ignore fetch error on mount
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchDbStatus(true);
  }, []);

  const handleSaveDualDbConfig = async () => {
    setSavingDbCfg(true);
    setDbFeedback(null);
    try {
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
      setDbFeedback({ ok: true, text: json.message || 'تنظیمات دو پایگاه داده با موفقیت ذخیره شد.' });
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
      } else {
        setCloudTestResult(result);
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

  const handleSyncToActiveDb = async () => {
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

  const handleGitAction = async (mode: 'CHECK' | 'PUSH' | 'PULL') => {
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
        setDbFeedback({ ok: true, text: json.message });
        await fetchDbStatus(false);
      } else if (mode === 'PULL') {
        const res = await fetch('/api/db/sync/pull', { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'خطا در به‌روزرسانی از دیتابیس آنلاین');
        if (json.checkResult) setLocalCheckOverride(json.checkResult);
        setDbFeedback({ ok: true, text: json.message });
        await onRefreshData?.();
        await fetchDbStatus(false);
      }
    } catch (err) {
      setDbFeedback({ ok: false, text: err instanceof Error ? err.message : 'خطا در عملیات همگام‌سازی' });
    } finally {
      setLocalGitBusy(null);
    }
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
      title: 'مدیر ارشد کارخانه (System Administrator)',
      description: 'دسترسی نامحدود به تمامی ماژول‌ها، تعریف کاربران، ابطال اسناد، پاکسازی داده‌ها و کالیبراسیون انبارگردانی',
      permissions: ['صدور کلیه اسناد', 'ابطال و صدور سند معکوس', 'تعریف قطعه و مسیر', 'تعریف ماشین‌آلات', 'پاکسازی امن دمو', 'مدیریت کاربران'],
      color: 'border-[#f9d6a7] bg-[#fff4e5] text-[#e9730c]',
    },
    {
      role: 'PRODUCTION_MANAGER',
      title: 'مدیر برنامه‌ریزی تولید (Production Manager)',
      description: 'نظارت بر ایستگاه‌های پرسکاری و جوش، تعریف مسیرهای تولید، کنترل گلوگاه‌ها و مانیتورینگ WIP',
      permissions: ['ثبت تولید سالم', 'ثبت انتقال بین مراحل', 'تعریف و اصلاح مسیر تولید', 'گزارش‌گیری کامل WIP', 'مشاهده ماشین‌آلات'],
      color: 'border-[#b3ddf2] bg-[#e5f3fa] text-[#007cc0]',
    },
    {
      role: 'WAREHOUSE_KEEPER',
      title: 'مسئول انبار و تدارکات ساپکو (Warehouse Keeper)',
      description: 'مدیریت کویل‌ها و شیت‌های ورودی ساپکو، صدور رسید بارنامه، حواله خروج به خطوط برش و انبار محصول نهایی',
      permissions: ['صدور رسید ورود ورق ساپکو', 'صدور حواله مصرف مواد اولیه', 'انبارگردانی اول دوره', 'مشاهده موجودی انبار مواد و محصول'],
      color: 'border-[#a9dfbf] bg-[#ebf7ef] text-[#107e3e]',
    },
    {
      role: 'LINE_SUPERVISOR',
      title: 'سرپرست سالن پرس و جوشکاری (Line Supervisor)',
      description: 'ثبت تیراژ شیفت، تخصیص اپراتورها و ماشین‌آلات، صدور کارت انتقال قطعه (کانبان) و تحویل در ایستگاه‌ها',
      permissions: ['ثبت تولید شیفت', 'ثبت خروج و ورود بین مراحل', 'مشاهده موجودی لحظه‌ای ایستگاه', 'تغییر وضعیت آمادگی ماشین'],
      color: 'border-[#d9d9d9] bg-[#f5f5f5] text-[#333333]',
    },
    {
      role: 'QC_INSPECTOR',
      title: 'بازرس کنترل کیفیت ساپکو (QC Inspector)',
      description: 'بازرسی ابعادی و متالورژی، کنترل پیچش مهره جوش، تست رنگ کاتافورز و ثبت ضایعات با کد علت نقص',
      permissions: ['ثبت ضایعات قطعات', 'ثبت علل عیوب قالب و کشش', 'مشاهده گزارش نرخ ضایعات', 'دسترسی فقط‌خواندنی به کاتالوگ'],
      color: 'border-[#f5b7b1] bg-[#ffecec] text-[#bb0000]',
    },
  ];

  const handleGoogleSignIn = async () => {
    setAuthErrorMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('token-service-api')) {
        setAuthErrorMsg(
          'سرویس Token Service API در پروژه کلود غیرفعال است. می‌توانید بدون نیاز به ورود ابری، مستقیماً از انتخابگر نقش‌های کارخانه در پایین استفاده کنید.'
        );
      } else {
        setAuthErrorMsg('ورود با حساب گوگل انجام نشد. می‌توانید از نقش‌های داخلی سامانه استفاده نمایید.');
      }
    }
  };

  const handleSignOut = async () => {
    setAuthErrorMsg(null);
    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out errors
    }
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

          <InlinePageGuideButton
            routeContext={{ tab: 'settings', settingsSubTab: activeSubTab }}
            label="آموزش این صفحه و دکمه‌ها"
          />
        </div>
      </div>

      {activeSubTab === 'rbac' ? (
        <div className="space-y-4">
          {/* Active Profile Info */}
          <div className="sap-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#333333]">
                  کاربر فعال در این نشست: {currentUser.displayName}
                </div>
                <div className="text-xs text-[#666666]">
                  نقش عملیاتی فعلی: <span className="text-[#007cc0] font-bold">{currentUser.role}</span>
                </div>
              </div>
            </div>

            {firebaseUser ? (
              <div className="flex items-center gap-2 bg-[#f5f5f5] px-3 py-1.5 rounded-sm border border-[#d9d9d9]">
                <div className="w-2 h-2 rounded-full bg-[#107e3e]" />
                <span className="text-xs text-[#333333]">{firebaseUser.email}</span>
                <button
                  onClick={handleSignOut}
                  className="mr-2 p-1 text-[#666666] hover:text-[#bb0000] cursor-pointer"
                  title="خروج از حساب"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>ورود با Google / Firebase</span>
              </button>
            )}
          </div>

          {authErrorMsg && (
            <div className="bg-[#fff4e5] border border-[#f9d6a7] text-[#e9730c] text-xs p-3 rounded-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authErrorMsg}</span>
            </div>
          )}

          {/* Role Cards Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {rolesInfo.map(info => {
              const isSelected = currentUser.role === info.role;
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
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm border ${info.color}`}>
                        {info.role}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-1 text-[11px] text-[#007cc0] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          نقش فعال شما
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#333333] mb-1.5">{info.title}</h3>
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
                    onClick={() => onRoleChange(info.role)}
                    className={`mt-4 w-full py-1.5 text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'sap-btn-emphasized'
                        : 'sap-btn-standard'
                    }`}
                  >
                    {isSelected ? 'نقش فعال است' : 'تغییر به این نقش'}
                  </button>
                </div>
              );
            })}
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
                  onChange={e => setLocalDbUrl(e.target.value)}
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
                  </div>
                  <span className="text-[10px] text-[#666666]">مناسب شبکه داخلی کارخانه (بدون نیاز به ورود مجدد رمز)</span>
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
                  onChange={e => setCloudDbUrl(e.target.value)}
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
                  </div>
                  <span className="text-[10px] text-[#666666]">پیشنهاد: Session Pooler سوپابیس (پس از تست موفق، همیشه ذخیره می‌ماند)</span>
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
                    onChange={e => setDeviceLabel(e.target.value)}
                    placeholder="مثلاً: لپتاپ مهندس حسینی یا کامپیوتر کارخانه"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#bfbfbf] rounded-sm focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#333333] block mb-1">
                    اولویت اتصال فعال در این سیستم:
                  </label>
                  <select
                    value={activeTarget}
                    onChange={e => setActiveTarget(e.target.value as any)}
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
