import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  CloudUpload,
  CloudDownload,
  GitBranch,
} from 'lucide-react';
import { CloudSyncCheckResult } from '../types/dbSync';
import { toPersianDigits } from '../utils/formatters';

interface ErpSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  partsCount: number;
  txCount: number;
  onOpenDbSettings?: () => void;
  cloudSyncCheck?: CloudSyncCheckResult | null;
  autoCheckCloudUpdates?: boolean;
  cloudSyncBusy?: 'CHECK' | 'PUSH' | 'PULL' | null;
  onToggleAutoCloudCheck?: (enabled: boolean) => Promise<void>;
  onCheckCloudUpdates?: (force?: boolean) => Promise<void>;
  onCloudPush?: () => Promise<void>;
  onCloudPull?: () => Promise<void>;
}

export const ErpSyncModal: React.FC<ErpSyncModalProps> = ({
  isOpen,
  onClose,
  partsCount,
  txCount,
  onOpenDbSettings,
  cloudSyncCheck,
  autoCheckCloudUpdates = false,
  cloudSyncBusy = null,
  onToggleAutoCloudCheck,
  onCheckCloudUpdates,
  onCloudPush,
  onCloudPull,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [liveDbInfo, setLiveDbInfo] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/db/status')
      .then(r => r.json())
      .then(json => {
        if (json?.success && json.data) {
          setLiveDbInfo(json.data);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRealServerCheck = async () => {
    setSyncing(true);
    setSyncStatus({
      ok: true,
      message: 'در حال همگام‌سازی داده‌ها با پایگاه داده فعال و بررسی سلامت سرور...',
    });
    try {
      const [syncRes, repRes] = await Promise.all([
        fetch('/api/db/sync', { method: 'POST' }).then(r => r.json()),
        fetch('/api/reports/dashboard-summary').then(r => r.json()),
      ]);

      if (syncRes?.status?.data || syncRes?.status) {
        setLiveDbInfo(syncRes.status.data || syncRes.status);
      }

      if (!syncRes?.success) {
        setSyncStatus({
          ok: false,
          message: syncRes?.error || 'خطا در همگام‌سازی داده‌ها با سرور.',
        });
        return;
      }

      const liveOrders = repRes?.data?.activeCustomerOrdersCount ?? 0;
      const liveMos = repRes?.data?.activeManufacturingOrdersCount ?? 0;

      setSyncStatus({
        ok: true,
        message: `${syncRes.message} (${partsCount} قطعه، ${txCount} سند کاردکس، ${liveOrders} سفارش و ${liveMos} دستور تولید).`,
      });
    } catch (err) {
      setSyncStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'خطا در برقراری ارتباط با سرویس‌های /api/*',
      });
    } finally {
      setSyncing(false);
    }
  };

  const isPgLive = liveDbInfo?.storageMode === 'POSTGRESQL_LIVE' && liveDbInfo?.isConnected;
  const dualLinks = liveDbInfo?.dualLinks;
  const gitState = cloudSyncCheck?.state;
  const hasCloudConfigured = Boolean(dualLinks?.hasCloudDbUrl || cloudSyncCheck?.cloudConfigured);

  const stateBadge = () => {
    switch (gitState) {
      case 'IN_SYNC':
        return { label: 'همگام با آنلاین', cls: 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]' };
      case 'REMOTE_AHEAD':
        return { label: 'آپدیت آنلاین موجود است (Pull)', cls: 'bg-[#fff4e5] text-[#b45309] border-[#f5cba7]' };
      case 'LOCAL_AHEAD':
        return { label: 'تغییرات محلی آپلودنشده (Push)', cls: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]' };
      case 'DIVERGED':
        return { label: 'تغییر همزمان محلی و آنلاین', cls: 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]' };
      case 'CLOUD_EMPTY':
        return { label: 'دیتابیس آنلاین خالی است', cls: 'bg-[#f5f5f5] text-[#555555] border-[#d9d9d9]' };
      case 'CLOUD_UNREACHABLE':
        return { label: 'دیتابیس آنلاین در دسترس نیست', cls: 'bg-[#fff4e5] text-[#e9730c] border-[#f5cba7]' };
      default:
        return { label: hasCloudConfigured ? 'آماده بررسی نسخه آنلاین' : 'لینک آنلاین تنظیم نشده', cls: 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]' };
    }
  };

  const badge = stateBadge();

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#d9d9d9]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#007cc0]" />
            <h3 className="text-sm font-bold text-[#333333]">
              وضعیت اتصال دو پایگاه داده (محلی و ابری) و همگام‌سازی Git-Style
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1 rounded hover:bg-[#f5f5f5] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-[#333333] max-h-[82vh] overflow-y-auto">
          <div className="p-3.5 rounded bg-[#f7f7f7] border border-[#d9d9d9] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">وضعیت پایگاه داده فعال:</span>
              {isPgLive ? (
                <span className="text-[#107e3e] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  متصل به PostgreSQL ({dualLinks?.resolvedTarget || 'LIVE'})
                </span>
              ) : (
                <span className="text-[#e9730c] font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  ذخیره‌سازی پایدار دیسک محلی (HYBRID_DURABLE_DISK)
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#666666]">لینک محلی (Local DB):</span>
              <span className="font-mono text-[11px] text-[#333333] truncate max-w-[330px]" dir="ltr">
                {dualLinks?.localDbUrlMasked || 'تنظیم‌نشده'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#666666]">لینک آنلاین (Cloud DB):</span>
              <span className="font-mono text-[11px] text-[#007cc0] truncate max-w-[330px]" dir="ltr">
                {dualLinks?.cloudDbUrlMasked || 'تنظیم‌نشده'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">اولویت انتخاب‌شده:</span>
              <span className="font-mono text-[#333333] font-semibold">{dualLinks?.activeTarget || 'AUTO'}</span>
            </div>
            {liveDbInfo?.errorMessage && !isPgLive && (
              <div className="text-[11px] text-[#7d3c0a] bg-[#fff4e5] border border-[#f5cba7] rounded p-2 mt-1">
                {liveDbInfo.errorMessage}
              </div>
            )}
          </div>

          {/* Git-Style Online Sync Panel */}
          <div className="p-3.5 rounded bg-[#f7f9fb] border border-[#cde1f0] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-[#333333]">
                <GitBranch className="w-4 h-4 text-[#007cc0]" />
                <span>همگام‌سازی بین سیستم‌ها (لپتاپ ↔ کامپیوتر کارخانه)</span>
              </div>
              <span className={`px-2 py-0.5 rounded-sm border text-[10px] font-bold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            {cloudSyncCheck?.messageFa && (
              <p className="text-[11px] text-[#444444] leading-relaxed">{cloudSyncCheck.messageFa}</p>
            )}

            {cloudSyncCheck && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white border border-[#e0e0e0] rounded p-2 space-y-1">
                  <div className="font-bold text-[#333333]">نسخه محلی ({cloudSyncCheck.deviceLabel})</div>
                  <div className="text-[#666666]">
                    نسخه: <span className="font-mono font-bold">Rev #{toPersianDigits(cloudSyncCheck.localRevision)}</span>
                  </div>
                  {cloudSyncCheck.localCounts && (
                    <div className="text-[#666666]">
                      {toPersianDigits(cloudSyncCheck.localCounts.parts)} قطعه · {toPersianDigits(cloudSyncCheck.localCounts.manufacturingOrders)} دستور کار
                    </div>
                  )}
                </div>
                <div className="bg-white border border-[#e0e0e0] rounded p-2 space-y-1">
                  <div className="font-bold text-[#007cc0]">نسخه دیتابیس آنلاین (Cloud)</div>
                  {cloudSyncCheck.cloudManifest ? (
                    <>
                      <div className="text-[#666666]">
                        نسخه: <span className="font-mono font-bold">Rev #{toPersianDigits(cloudSyncCheck.cloudManifest.revision)}</span> ({cloudSyncCheck.cloudManifest.deviceLabel})
                      </div>
                      <div className="text-[#666666]">
                        {toPersianDigits(cloudSyncCheck.cloudManifest.counts.parts)} قطعه · {toPersianDigits(cloudSyncCheck.cloudManifest.counts.manufacturingOrders)} دستور کار
                      </div>
                    </>
                  ) : (
                    <div className="text-[#888888]">اطلاعاتی از نسخه آنلاین دریافت نشده است</div>
                  )}
                </div>
              </div>
            )}

            {onToggleAutoCloudCheck && (
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[#333333] cursor-pointer select-none bg-white border border-[#d9d9d9] rounded px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={autoCheckCloudUpdates}
                  onChange={e => onToggleAutoCloudCheck(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#007cc0] cursor-pointer"
                />
                <span>بررسی خودکار آپدیت دیتابیس آنلاین در حین اجرا (مثل Git، بدون افت سرعت)</span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {onCheckCloudUpdates && (
                <button
                  type="button"
                  onClick={() => onCheckCloudUpdates(true)}
                  disabled={Boolean(cloudSyncBusy) || !hasCloudConfigured}
                  className="sap-btn-standard text-[11px] px-2.5 py-1 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${cloudSyncBusy === 'CHECK' ? 'animate-spin' : ''}`} />
                  <span>{cloudSyncBusy === 'CHECK' ? 'در حال بررسی...' : 'چک نسخه آنلاین'}</span>
                </button>
              )}
              {onCloudPush && (
                <button
                  type="button"
                  onClick={onCloudPush}
                  disabled={Boolean(cloudSyncBusy) || !hasCloudConfigured}
                  className="sap-btn-standard text-[11px] px-2.5 py-1 flex items-center gap-1 cursor-pointer text-[#007cc0] border-[#b3ddf2] bg-[#eef7fc] hover:bg-[#dceefa] disabled:opacity-50"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>{cloudSyncBusy === 'PUSH' ? 'در حال آپلود...' : 'آپلود به آنلاین (Push)'}</span>
                </button>
              )}
              {onCloudPull && (
                <button
                  type="button"
                  onClick={onCloudPull}
                  disabled={Boolean(cloudSyncBusy) || !hasCloudConfigured}
                  className="sap-btn-emphasized text-[11px] px-3 py-1 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <CloudDownload className="w-3.5 h-3.5" />
                  <span>{cloudSyncBusy === 'PULL' ? 'در حال به‌روزرسانی...' : 'به‌روزرسانی محلی از آنلاین (Pull)'}</span>
                </button>
              )}
            </div>
          </div>

          {syncStatus && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 border ${
                syncStatus.ok
                  ? 'bg-[#eef8f2] border-[#b2dfc4] text-[#107e3e]'
                  : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
              }`}
            >
              {syncStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 text-[#107e3e] shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#bb0000] shrink-0" />
              )}
              <span>{syncStatus.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3.5 border-t border-[#e8e8e8]">
            {onOpenDbSettings ? (
              <button
                type="button"
                onClick={onOpenDbSettings}
                className="text-[11px] text-[#007cc0] hover:underline font-bold cursor-pointer"
              >
                ویرایش لینک‌ها و تنظیمات کامل پایگاه داده ←
              </button>
            ) : (
              <div className="text-[11px] text-[#666666] font-mono">
                GET /api/db/status ({isPgLive ? 'PG_LIVE' : 'DURABLE_DISK'})
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="sap-btn-standard text-xs"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={handleRealServerCheck}
                disabled={syncing}
                className="sap-btn-standard text-xs flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'در حال همگام‌سازی...' : 'ذخیره در پایگاه داده فعال'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


