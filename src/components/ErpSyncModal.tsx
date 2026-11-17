import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';

interface ErpSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  partsCount: number;
  txCount: number;
  onOpenDbSettings?: () => void;
}

export const ErpSyncModal: React.FC<ErpSyncModalProps> = ({
  isOpen,
  onClose,
  partsCount,
  txCount,
  onOpenDbSettings,
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

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#d9d9d9]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#007cc0]" />
            <h3 className="text-sm font-bold text-[#333333]">
              وضعیت اتصال دو پایگاه داده (محلی و ابری) و درگاه ERP ساپکو
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

        <div className="p-5 space-y-4 text-xs text-[#333333]">
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
              <span className="font-mono text-[11px] text-[#333333] truncate max-w-[300px]" dir="ltr">
                {dualLinks?.localDbUrlMasked || 'تنظیم‌نشده'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#666666]">لینک ابری (Cloud DB):</span>
              <span className="font-mono text-[11px] text-[#007cc0] truncate max-w-[300px]" dir="ltr">
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
                ویرایش و تست لینک هر دو پایگاه داده (محلی و ابری) ←
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
                className="sap-btn-emphasized text-xs flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی و تست زنده سرور'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

