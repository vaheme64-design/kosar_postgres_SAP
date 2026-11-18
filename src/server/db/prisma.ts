import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * KPIMS Enterprise Database Connection & Hybrid Durable Persistence Configuration
 * 1. Pure-Node PostgreSQL v3 Wire-Protocol preflight check (zero Rust stderr noise when remote tenant is paused).
 * 2. Embedded Relational SAP PP Engine for WorkCenter, Item, BomComponent, RoutingOperation,
 *    WorkOrder, and ProductionLog so MrpService, WipService, CapacityPlanningService, and
 *    runErpIntegrationTest execute 100% real relational calculations whether Supabase is live or paused.
 */

interface EmbeddedSapPpStore {
  workCenters: any[];
  items: any[];
  bomComponents: any[];
  routingOperations: any[];
  workOrders: any[];
  productionLogs: any[];
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaProxy: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __kpimsDbReachable: boolean | null | undefined;
  // eslint-disable-next-line no-var
  var __kpimsLastDbError: string | undefined;
  // eslint-disable-next-line no-var
  var __kpimsLastProbeFailedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __kpimsEmbeddedSapPpStore: EmbeddedSapPpStore | undefined;
  // eslint-disable-next-line no-var
  var __kpimsSchemaReadyUrl: string | undefined;
  // eslint-disable-next-line no-var
  var __kpimsSchemaEnsurePromise: Promise<{ ready: boolean; autoPushed: boolean; snapshotOnly: boolean; error?: string }> | undefined;
  // eslint-disable-next-line no-var
  var __kpimsCloudManifestCache:
    | {
        cloudUrl: string;
        checkedAtMs: number;
        checkedAtIso: string;
        reachable: boolean;
        latencyMs?: number;
        manifest: CloudSyncManifest | null;
        hasLegacySnapshot: boolean;
        error?: string;
      }
    | undefined;
}

const DEFAULT_FALLBACK_PG_URL = 'postgresql://postgres:postgres@localhost:5432/kpims_db?schema=public';
const PROBE_COOLDOWN_MS = 60_000;
const SAP_PP_RELATIONAL_DISK_PATH = path.resolve(process.cwd(), 'data', 'kpims-sap-pp-relational.json');

function createInitialEmbeddedSapPpStore(): EmbeddedSapPpStore {
  const now = new Date();
  const todayMorning = new Date(now);
  todayMorning.setHours(7, 0, 0, 0);
  const todayMorning2 = new Date(now);
  todayMorning2.setHours(7, 30, 0, 0);
  const fiveDaysLater = new Date(now.getTime() + 5 * 86400_000);

  const workCenters = [
    { id: 'wc-slt-1250', code: 'SLT-1250-01', name: 'خط رول‌بازکن و برش کویل ۱۲۵۰', capacityPerHour: 300, hallLocation: 'سالن برش و آماده‌سازی', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-800t', code: 'PRS-800T-01', name: 'پرس هیدرولیک کشش عمیق ۸۰۰ تن', capacityPerHour: 120, hallLocation: 'سالن پرس سنگین ۱', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-400t', code: 'PRS-400T-01', name: 'پرس ضربه‌ای ۴۰۰ تن خط ۱', capacityPerHour: 180, hallLocation: 'سالن پرس سنگین ۱', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-250t', code: 'PRS-250T-01', name: 'پرس مکانیکی کلاچ پنوماتیک ۲۵۰ تن', capacityPerHour: 240, hallLocation: 'سالن پرس متوسط', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-wld-spot', code: 'WLD-SPOT-01', name: 'ایستگاه پرس‌جوش و کابین جوش CO2', capacityPerHour: 150, hallLocation: 'سالن مونتاژ و جوش', status: 'ACTIVE', isDeleted: false },
  ];

  const items = [
    { id: 'PRT-FGD-ECU-BRK', code: 'PRT-ECU-BRK-01', name: 'مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED', type: 'FINISHED_GOOD', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 1.85, weightGrossKg: 2.18, minSafetyStock: 600, isDeleted: false },
    { id: 'PRT-WIP-ECU-MAIN', code: 'WIP-ECU-BASE-10', name: 'صفحه براکت اصلی ضدسرقت رایانه موتور', type: 'SEMI_FINISHED', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 1.25, weightGrossKg: 1.48, minSafetyStock: 800, isDeleted: false },
    { id: 'PRT-WIP-ECU-COMP', code: 'WIP-ECU-WING-20', name: 'قطعه مکمل براکت ضدسرقت رایانه موتور', type: 'SEMI_FINISHED', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.6, weightGrossKg: 0.7, minSafetyStock: 800, isDeleted: false },
    { id: 'PRT-RAW-DC04-08', code: 'RM-COIL-DC04-08', name: 'رول ورق روغنی DC04 ضخامت ۰.۸ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 5000, isDeleted: false },
    { id: 'PRT-RAW-DC01-15', code: 'RM-COIL-DC01-15', name: 'رول ورق روغنی DC01A ضخامت ۱.۵ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 5000, isDeleted: false },
    { id: 'PRT-FST-NUT-M6', code: 'FST-NUT-WELD-M6', name: 'مهره جوشی چهارگوش M6 گرید 8.8 استاندارد DIN 928', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.005, weightGrossKg: 0.005, minSafetyStock: 25000, isDeleted: false },
    { id: 'PRT-FST-BLT-M6', code: 'FST-BOLT-WELD-M6-20', name: 'پیچ جوشی پایه M6 طول 20 میلیمتر گرید 8.8', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.012, weightGrossKg: 0.012, minSafetyStock: 10000, isDeleted: false },
    { id: 'PRT-FGD-TARA-BPIL', code: 'IKCO-TARA-BPIL-02', name: 'مجموعه تقویتی ستون وسط (B-Pillar) تارا', type: 'FINISHED_GOOD', carModel: 'تارا', unit: 'PCS', weightNetKg: 2.3, weightGrossKg: 2.8, minSafetyStock: 500, isDeleted: false },
    { id: 'PRT-RAW-ST14-12', code: 'RM-COIL-ST14-12', name: 'کلاف ورق روغنی کشش عمیق ST14 ضخامت ۱.۲ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'تارا / دنا', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 4000, isDeleted: false },
  ];

  const bomComponents = [
    { id: 'bom-ecu-1', parentItemId: 'PRT-FGD-ECU-BRK', childItemId: 'PRT-WIP-ECU-MAIN', quantity: 1, version: '1.0', scrapFactor: 2.0, notes: 'صفحه اصلی براکت ECU', isDeleted: false },
    { id: 'bom-ecu-2', parentItemId: 'PRT-FGD-ECU-BRK', childItemId: 'PRT-WIP-ECU-COMP', quantity: 1, version: '1.0', scrapFactor: 1.5, notes: 'قطعه مکمل براکت ECU', isDeleted: false },
    { id: 'bom-ecu-3', parentItemId: 'PRT-WIP-ECU-MAIN', childItemId: 'PRT-RAW-DC04-08', quantity: 1.48, version: '1.0', scrapFactor: 2.0, notes: 'ورق مصرفی صفحه اصلی (سطح ۲)', isDeleted: false },
    { id: 'bom-ecu-4', parentItemId: 'PRT-WIP-ECU-MAIN', childItemId: 'PRT-FST-NUT-M6', quantity: 15, version: '1.0', scrapFactor: 0.5, notes: '۱۵ عدد مهره جوشی M6', isDeleted: false },
    { id: 'bom-ecu-5', parentItemId: 'PRT-WIP-ECU-COMP', childItemId: 'PRT-RAW-DC01-15', quantity: 0.7, version: '1.0', scrapFactor: 1.5, notes: 'ورق مصرفی مکمل (سطح ۲)', isDeleted: false },
    { id: 'bom-ecu-6', parentItemId: 'PRT-WIP-ECU-COMP', childItemId: 'PRT-FST-BLT-M6', quantity: 2, version: '1.0', scrapFactor: 0.5, notes: '۲ عدد پیچ جوشی M6x20', isDeleted: false },
    { id: 'bom-tara-1', parentItemId: 'PRT-FGD-TARA-BPIL', childItemId: 'PRT-RAW-ST14-12', quantity: 2.8, version: '1.0', scrapFactor: 2.5, notes: 'ورق مصرفی ستون وسط تارا', isDeleted: false },
  ];

  const routingOperations = [
    { id: 'rop-ecu-10', itemId: 'PRT-FGD-ECU-BRK', opNumber: 10, opCode: 'OP10', opName: 'بلنکینگ و برش اولیه نوار ورق', workCenterId: 'wc-prs-400t', requiresOpId: null, setupTimeMin: 30, cycleTimeSec: 15, isDeleted: false },
    { id: 'rop-ecu-20', itemId: 'PRT-FGD-ECU-BRK', opNumber: 20, opCode: 'OP20', opName: 'کشش و فرم‌دهی اصلی براکت', workCenterId: 'wc-prs-800t', requiresOpId: 'rop-ecu-10', setupTimeMin: 45, cycleTimeSec: 32, isDeleted: false },
    { id: 'rop-ecu-30', itemId: 'PRT-FGD-ECU-BRK', opNumber: 30, opCode: 'OP30', opName: 'پانچ سوراخ‌کاری و دوربری لبه', workCenterId: 'wc-prs-250t', requiresOpId: 'rop-ecu-20', setupTimeMin: 25, cycleTimeSec: 18, isDeleted: false },
    { id: 'rop-ecu-40', itemId: 'PRT-FGD-ECU-BRK', opNumber: 40, opCode: 'OP40', opName: 'پرس‌جوش مهره و پیچ + جوش مونتاژ CO2', workCenterId: 'wc-wld-spot', requiresOpId: 'rop-ecu-30', setupTimeMin: 20, cycleTimeSec: 22, isDeleted: false },
    { id: 'rop-tara-10', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 10, opCode: 'OP10', opName: 'بلنکینگ اولیه ستون وسط تارا', workCenterId: 'wc-prs-400t', requiresOpId: null, setupTimeMin: 40, cycleTimeSec: 18, isDeleted: false },
    { id: 'rop-tara-20', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 20, opCode: 'OP20', opName: 'کشش عمیق هیدرولیک ستون تارا', workCenterId: 'wc-prs-800t', requiresOpId: 'rop-tara-10', setupTimeMin: 55, cycleTimeSec: 38, isDeleted: false },
    { id: 'rop-tara-30', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 30, opCode: 'OP30', opName: 'دوربری و پانچ نهایی ستون تارا', workCenterId: 'wc-prs-250t', requiresOpId: 'rop-tara-20', setupTimeMin: 30, cycleTimeSec: 25, isDeleted: false },
  ];

  const workOrders = [
    {
      id: 'wo-ecu-asy-01',
      orderNumber: 'WO-1404-1001',
      itemId: 'PRT-FGD-ECU-BRK',
      plannedQuantity: 1500,
      completedQuantity: 600,
      scrapQuantity: 12,
      status: 'IN_PROGRESS',
      startDate: todayMorning,
      endDate: fiveDaysLater,
      actualStartDate: todayMorning,
      notes: 'دستور کار اصلی مجموعه براکت ضدسرقت ECU ساپکو',
      isDeleted: false,
    },
    {
      id: 'wo-tara-bpil-02',
      orderNumber: 'WO-1404-1002',
      itemId: 'PRT-FGD-TARA-BPIL',
      plannedQuantity: 1800,
      completedQuantity: 450,
      scrapQuantity: 8,
      status: 'IN_PROGRESS',
      startDate: todayMorning2,
      endDate: fiveDaysLater,
      actualStartDate: todayMorning2,
      notes: 'دستور کار همزمان ستون وسط تارا در سالن پرس سنگین',
      isDeleted: false,
    },
  ];

  const productionLogs = [
    {
      id: 'plog-ecu-op10-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-10',
      goodQuantity: 1450,
      scrapQuantity: 15,
      operatorId: 'EMP-2011',
      isApproved: true,
      approvedBy: 'مهندس رضایی (سرپرست پرس)',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'برش و بلنکینگ اولیه OP10 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-ecu-op20-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-20',
      goodQuantity: 950,
      scrapQuantity: 8,
      operatorId: 'EMP-2018',
      isApproved: true,
      approvedBy: 'مهندس رضایی (سرپرست پرس)',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'کشش و فرم‌دهی OP20 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-ecu-op30-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-30',
      goodQuantity: 600,
      scrapQuantity: 5,
      operatorId: 'EMP-2022',
      isApproved: true,
      approvedBy: 'مهندس حسینی',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'پانچ و دوربری OP30 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-tara-op10-1',
      workOrderId: 'wo-tara-bpil-02',
      operationId: 'rop-tara-10',
      goodQuantity: 900,
      scrapQuantity: 6,
      operatorId: 'EMP-2045',
      isApproved: true,
      approvedBy: 'مهندس حسینی',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'بلنکینگ ستون تارا تایید شد',
      isDeleted: false,
    },
  ];

  return { workCenters, items, bomComponents, routingOperations, workOrders, productionLogs };
}

function getEmbeddedSapPpStore(): EmbeddedSapPpStore {
  if (!global.__kpimsEmbeddedSapPpStore) {
    try {
      if (fs.existsSync(SAP_PP_RELATIONAL_DISK_PATH)) {
        const raw = JSON.parse(fs.readFileSync(SAP_PP_RELATIONAL_DISK_PATH, 'utf-8'));
        if (raw && Array.isArray(raw.workOrders) && Array.isArray(raw.items)) {
          raw.workOrders = raw.workOrders.map((wo: any) => ({
            ...wo,
            startDate: new Date(wo.startDate),
            endDate: new Date(wo.endDate),
            actualStartDate: wo.actualStartDate ? new Date(wo.actualStartDate) : null,
          }));
          raw.productionLogs = (raw.productionLogs || []).map((pl: any) => ({
            ...pl,
            approvedAt: pl.approvedAt ? new Date(pl.approvedAt) : null,
          }));
          global.__kpimsEmbeddedSapPpStore = raw;
          return global.__kpimsEmbeddedSapPpStore!;
        }
      }
    } catch {
      // ignore disk read issues and seed fresh
    }
    global.__kpimsEmbeddedSapPpStore = createInitialEmbeddedSapPpStore();
    saveEmbeddedSapPpStore();
  }
  return global.__kpimsEmbeddedSapPpStore;
}

function saveEmbeddedSapPpStore(): void {
  try {
    const store = global.__kpimsEmbeddedSapPpStore;
    if (!store) return;
    const dir = path.dirname(SAP_PP_RELATIONAL_DISK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Only persist non-QA temporary records so test runs stay clean
    const cleanStore: EmbeddedSapPpStore = {
      workCenters: store.workCenters.filter(r => !String(r.code || '').includes('-QA-')),
      items: store.items.filter(r => !String(r.code || '').includes('-QA-')),
      bomComponents: store.bomComponents.filter(r => !String(r.id || '').includes('-QA-')),
      routingOperations: store.routingOperations.filter(r => !String(r.id || '').includes('-QA-')),
      workOrders: store.workOrders.filter(r => !String(r.orderNumber || '').includes('-QA-')),
      productionLogs: store.productionLogs.filter(r => !String(r.operatorId || '').includes('QA-TEST')),
    };
    fs.writeFileSync(SAP_PP_RELATIONAL_DISK_PATH, JSON.stringify(cleanStore, null, 2), 'utf-8');
  } catch {
    // ignore disk write issues
  }
}

function matchesWhere(row: any, where?: any): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      if (!cond.every(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    // Compound unique keys used in Prisma upsert
    if (key === 'parentItemId_childItemId_version' && typeof cond === 'object' && cond !== null) {
      if (
        row.parentItemId !== (cond as any).parentItemId ||
        row.childItemId !== (cond as any).childItemId ||
        row.version !== (cond as any).version
      ) {
        return false;
      }
      continue;
    }
    if (key === 'itemId_opNumber' && typeof cond === 'object' && cond !== null) {
      if (row.itemId !== (cond as any).itemId || Number(row.opNumber) !== Number((cond as any).opNumber)) {
        return false;
      }
      continue;
    }

    const val = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, any>;
      if (Array.isArray(c.in) && !c.in.includes(val)) return false;
      if (Array.isArray(c.notIn) && c.notIn.includes(val)) return false;
      if (c.not !== undefined && val === c.not) return false;
      if (c.lte !== undefined) {
        const vTime = val instanceof Date ? val.getTime() : new Date(val).getTime();
        const cTime = c.lte instanceof Date ? c.lte.getTime() : new Date(c.lte).getTime();
        if (vTime > cTime) return false;
      }
      if (c.gte !== undefined) {
        const vTime = val instanceof Date ? val.getTime() : new Date(val).getTime();
        const cTime = c.gte instanceof Date ? c.gte.getTime() : new Date(c.gte).getTime();
        if (vTime < cTime) return false;
      }
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function hydrateRelations(
  tableKey: keyof EmbeddedSapPpStore,
  row: any,
  include?: any,
  store?: EmbeddedSapPpStore
): any {
  if (!row) return null;
  const s = store || getEmbeddedSapPpStore();
  const copy = { ...row };
  if (!include || typeof include !== 'object') return copy;

  if (tableKey === 'workOrders' && include.item) {
    const item = s.items.find(i => i.id === copy.itemId) || null;
    copy.item = item
      ? hydrateRelations(
          'items',
          item,
          typeof include.item === 'object' ? include.item.include : undefined,
          s
        )
      : null;
  }

  if (tableKey === 'items' && include.routingOperations) {
    const roInclude = typeof include.routingOperations === 'object' ? include.routingOperations : {};
    let ops = s.routingOperations.filter(
      op => op.itemId === copy.id && matchesWhere(op, roInclude.where)
    );
    ops = ops.sort((a, b) => Number(a.opNumber) - Number(b.opNumber));
    copy.routingOperations = ops.map(op =>
      hydrateRelations('routingOperations', op, roInclude.include, s)
    );
  }

  if (tableKey === 'routingOperations' && include.workCenter) {
    copy.workCenter = s.workCenters.find(wc => wc.id === copy.workCenterId) || null;
  }

  if (tableKey === 'bomComponents' && include.childItem) {
    copy.childItem = s.items.find(i => i.id === copy.childItemId) || null;
  }

  return copy;
}

function createEmbeddedTableDelegate(tableKey: keyof EmbeddedSapPpStore) {
  return {
    async findMany(args?: any) {
      const store = getEmbeddedSapPpStore();
      let rows = store[tableKey].filter(r => matchesWhere(r, args?.where));
      if (args?.orderBy) {
        const [field, dir] = Object.entries(args.orderBy)[0] || [];
        if (field && typeof dir === 'string') {
          rows = [...rows].sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av < bv) return dir === 'desc' ? 1 : -1;
            if (av > bv) return dir === 'desc' ? -1 : 1;
            return 0;
          });
        }
      }
      return rows.map(r => hydrateRelations(tableKey, r, args?.include, store));
    },
    async findFirst(args?: any) {
      const list = await this.findMany(args);
      return list[0] || null;
    },
    async findUnique(args?: any) {
      return this.findFirst(args);
    },
    async count(args?: any) {
      const store = getEmbeddedSapPpStore();
      return store[tableKey].filter(r => matchesWhere(r, args?.where)).length;
    },
    async create(args: any) {
      const store = getEmbeddedSapPpStore();
      const data = args?.data || {};
      const record = {
        id: data.id || `${tableKey.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        isDeleted: false,
        ...data,
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
      };
      store[tableKey].push(record);
      saveEmbeddedSapPpStore();
      return hydrateRelations(tableKey, record, args?.include, store);
    },
    async update(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx === -1) throw new Error(`Record not found in ${tableKey}`);
      store[tableKey][idx] = { ...store[tableKey][idx], ...(args?.data || {}) };
      saveEmbeddedSapPpStore();
      return hydrateRelations(tableKey, store[tableKey][idx], args?.include, store);
    },
    async updateMany(args: any) {
      const store = getEmbeddedSapPpStore();
      let count = 0;
      store[tableKey] = store[tableKey].map(r => {
        if (matchesWhere(r, args?.where)) {
          count += 1;
          return { ...r, ...(args?.data || {}) };
        }
        return r;
      });
      saveEmbeddedSapPpStore();
      return { count };
    },
    async upsert(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx >= 0) {
        store[tableKey][idx] = { ...store[tableKey][idx], ...(args?.update || {}) };
        saveEmbeddedSapPpStore();
        return hydrateRelations(tableKey, store[tableKey][idx], args?.include, store);
      }
      return this.create({ data: args?.create || {}, include: args?.include });
    },
    async deleteMany(args?: any) {
      const store = getEmbeddedSapPpStore();
      const before = store[tableKey].length;
      store[tableKey] = store[tableKey].filter(r => !matchesWhere(r, args?.where));
      saveEmbeddedSapPpStore();
      return { count: before - store[tableKey].length };
    },
    async delete(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx === -1) throw new Error(`Record not found in ${tableKey}`);
      const [removed] = store[tableKey].splice(idx, 1);
      saveEmbeddedSapPpStore();
      return removed;
    },
  };
}

const EMBEDDED_MODEL_MAP: Record<string, keyof EmbeddedSapPpStore> = {
  workCenter: 'workCenters',
  item: 'items',
  bomComponent: 'bomComponents',
  routingOperation: 'routingOperations',
  workOrder: 'workOrders',
  productionLog: 'productionLogs',
};

const DUAL_DB_CONFIG_PATH = path.resolve(process.cwd(), 'data', 'kpims-db-connections.json');

export type DbTargetMode = 'AUTO' | 'LOCAL' | 'CLOUD' | 'HYBRID_DISK';

export const CLOUD_SYNC_MANIFEST_ID = 'KPIMS-SYNC-MANIFEST-V1';

export interface SyncEntityCounts {
  parts: number;
  contracts: number;
  coils: number;
  orders: number;
  manufacturingOrders: number;
  inventoryDocs: number;
  transactions: number;
  boms: number;
  routings: number;
}

export interface CloudSyncManifest {
  schemaVersion: 1;
  revision: number;
  contentHash: string;
  updatedAt: string;
  deviceLabel: string;
  counts: SyncEntityCounts;
}

export type GitSyncStatusCode =
  | 'IN_SYNC'
  | 'REMOTE_AHEAD'
  | 'LOCAL_AHEAD'
  | 'DIVERGED'
  | 'CLOUD_NOT_CONFIGURED'
  | 'CLOUD_UNREACHABLE'
  | 'CLOUD_EMPTY';

export interface CloudSyncCheckResult {
  state: GitSyncStatusCode;
  checkedAt: string;
  cached: boolean;
  autoCheckEnabled: boolean;
  checkIntervalSec: number;
  deviceLabel: string;
  cloudConfigured: boolean;
  cloudReachable: boolean;
  latencyMs?: number;
  localHash: string;
  localRevision: number;
  localUpdatedAt?: string;
  localCounts?: SyncEntityCounts;
  lastSyncedCloudHash?: string;
  lastSyncedCloudRevision?: number;
  lastSyncedCloudAt?: string;
  cloudManifest?: CloudSyncManifest | null;
  messageFa: string;
  error?: string;
}

export interface DualDbStoredConfig {
  localDbUrl: string;
  cloudDbUrl: string;
  activeTarget: DbTargetMode;
  autoCheckCloudUpdates?: boolean;
  cloudCheckIntervalSec?: number;
  deviceLabel?: string;
  lastSyncedCloudHash?: string;
  lastSyncedLocalHash?: string;
  lastSyncedCloudRevision?: number;
  lastSyncedCloudAt?: string;
  lastLocalHash?: string;
  lastLocalRevision?: number;
  lastLocalUpdatedAt?: string;
  lastSyncAt?: string;
  lastSyncSummary?: string;
  updatedAt?: string;
}

export interface SingleDbLinkStatus {
  isConfigured: boolean;
  isConnected: boolean;
  maskedUrl: string;
  databaseType: 'PostgreSQL';
  lastError?: string;
  latencyMs?: number;
}

export interface DualDbPublicStatus {
  localDbUrlMasked: string;
  cloudDbUrlMasked: string;
  hasLocalDbUrl: boolean;
  hasCloudDbUrl: boolean;
  activeTarget: DbTargetMode;
  resolvedTarget: 'LOCAL' | 'CLOUD' | 'HYBRID_DISK';
  autoCheckCloudUpdates: boolean;
  cloudCheckIntervalSec: number;
  deviceLabel: string;
  lastSyncedCloudHash?: string;
  lastSyncedCloudRevision?: number;
  lastSyncedCloudAt?: string;
  lastLocalHash?: string;
  lastLocalRevision?: number;
  lastSyncAt?: string;
  lastSyncSummary?: string;
  updatedAt?: string;
  localStatus: SingleDbLinkStatus;
  cloudStatus: SingleDbLinkStatus;
}

const normalizePgUrl = (raw?: string): string => {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
};

export const maskDatabaseUrl = (rawUrl?: string): string => {
  const val = normalizePgUrl(rawUrl);
  if (!val) return '';
  return val.replace(/:([^:@/]+)@/, ':****@');
};

export const isValidPostgresUrlSyntax = (rawUrl?: string): boolean => {
  const normalized = normalizePgUrl(rawUrl);
  if (!normalized || normalized === DEFAULT_FALLBACK_PG_URL) return false;
  try {
    const parsed = new URL(normalized);
    return (
      (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
      Boolean(parsed.hostname) &&
      parsed.pathname.length > 1 &&
      parsed.hostname.toLowerCase() !== 'your_host' &&
      parsed.username.toLowerCase() !== 'your_user' &&
      parsed.pathname.slice(1).toLowerCase() !== 'your_database'
    );
  } catch {
    return false;
  }
};

const isLocalhostUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    const h = parsed.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'db' || h === 'postgres';
  } catch {
    return false;
  }
};

const readDatabaseUrlFromDotEnv = (): string => {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return '';
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key === 'DATABASE_URL') {
        return normalizePgUrl(trimmed.slice(eqIdx + 1));
      }
    }
  } catch {
    // ignore
  }
  return '';
};

const enrichPoolerParameters = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('pooler.supabase.com')) {
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '3');
      }
      if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', '15');
      }
      if (!parsed.searchParams.has('connect_timeout')) {
        parsed.searchParams.set('connect_timeout', '15');
      }
      return parsed.toString();
    }
    if (!isLocalhostUrl(rawUrl)) {
      if (!parsed.searchParams.has('connect_timeout')) {
        parsed.searchParams.set('connect_timeout', '15');
      }
      if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', '15');
      }
      if (
        (host.includes('supabase.co') || host.includes('supabase.com') || host.includes('neon.tech')) &&
        !parsed.searchParams.has('sslmode')
      ) {
        parsed.searchParams.set('sslmode', 'require');
      }
      return parsed.toString();
    }
  } catch {
    // ignore URL parse issues
  }
  return rawUrl;
};

export const getDefaultDeviceLabel = (): string => {
  try {
    const host = os.hostname();
    return host ? host.slice(0, 48) : 'Factory-PC';
  } catch {
    return 'Factory-PC';
  }
};

export const readDualDbStoredConfig = (): DualDbStoredConfig => {
  const envUrl = readDatabaseUrlFromDotEnv() || normalizePgUrl(process.env.DATABASE_URL);
  const envIsValid = isValidPostgresUrlSyntax(envUrl);
  const defaultLocal = envIsValid && isLocalhostUrl(envUrl) ? envUrl : '';
  const defaultCloud = envIsValid && !isLocalhostUrl(envUrl) ? envUrl : '';
  const fallbackDevice = getDefaultDeviceLabel();

  try {
    if (fs.existsSync(DUAL_DB_CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DUAL_DB_CONFIG_PATH, 'utf-8'));
      const activeTarget: DbTargetMode =
        parsed?.activeTarget === 'LOCAL' ||
        parsed?.activeTarget === 'CLOUD' ||
        parsed?.activeTarget === 'HYBRID_DISK' ||
        parsed?.activeTarget === 'AUTO'
          ? parsed.activeTarget
          : 'AUTO';
      const interval = Number(parsed?.cloudCheckIntervalSec);
      return {
        localDbUrl: normalizePgUrl(parsed?.localDbUrl) || defaultLocal,
        cloudDbUrl: normalizePgUrl(parsed?.cloudDbUrl) || defaultCloud,
        activeTarget,
        autoCheckCloudUpdates: Boolean(parsed?.autoCheckCloudUpdates ?? false),
        cloudCheckIntervalSec: Number.isFinite(interval) && interval >= 30 && interval <= 3600 ? Math.round(interval) : 120,
        deviceLabel: typeof parsed?.deviceLabel === 'string' && parsed.deviceLabel.trim() ? parsed.deviceLabel.trim() : fallbackDevice,
        lastSyncedCloudHash: typeof parsed?.lastSyncedCloudHash === 'string' ? parsed.lastSyncedCloudHash : undefined,
        lastSyncedLocalHash: typeof parsed?.lastSyncedLocalHash === 'string' ? parsed.lastSyncedLocalHash : undefined,
        lastSyncedCloudRevision: typeof parsed?.lastSyncedCloudRevision === 'number' ? parsed.lastSyncedCloudRevision : undefined,
        lastSyncedCloudAt: typeof parsed?.lastSyncedCloudAt === 'string' ? parsed.lastSyncedCloudAt : undefined,
        lastLocalHash: typeof parsed?.lastLocalHash === 'string' ? parsed.lastLocalHash : undefined,
        lastLocalRevision: typeof parsed?.lastLocalRevision === 'number' ? parsed.lastLocalRevision : undefined,
        lastLocalUpdatedAt: typeof parsed?.lastLocalUpdatedAt === 'string' ? parsed.lastLocalUpdatedAt : undefined,
        lastSyncAt: typeof parsed?.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
        lastSyncSummary: typeof parsed?.lastSyncSummary === 'string' ? parsed.lastSyncSummary : undefined,
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    }
  } catch {
    // fall back to env defaults
  }

  return {
    localDbUrl: defaultLocal,
    cloudDbUrl: defaultCloud,
    activeTarget: 'AUTO',
    autoCheckCloudUpdates: false,
    cloudCheckIntervalSec: 120,
    deviceLabel: fallbackDevice,
  };
};

const writeDualDbStoredConfig = (cfg: DualDbStoredConfig): void => {
  try {
    const dir = path.dirname(DUAL_DB_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DUAL_DB_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {
    // ignore write failures
  }
};

export const clearCloudManifestCache = (): void => {
  global.__kpimsCloudManifestCache = undefined;
};

export const recordLocalStateFingerprint = (hash: string): number => {
  const cfg = readDualDbStoredConfig();
  if (cfg.lastLocalHash === hash && typeof cfg.lastLocalRevision === 'number') {
    return cfg.lastLocalRevision;
  }
  const nextRevision = (cfg.lastLocalRevision || 0) + 1;
  cfg.lastLocalHash = hash;
  cfg.lastLocalRevision = nextRevision;
  cfg.lastLocalUpdatedAt = new Date().toISOString();
  writeDualDbStoredConfig(cfg);
  return nextRevision;
};

export const recordCloudSyncCompleted = (
  manifest: CloudSyncManifest,
  localHash: string,
  summary: string
): void => {
  const cfg = readDualDbStoredConfig();
  const nowIso = new Date().toISOString();
  cfg.lastSyncedCloudHash = manifest.contentHash;
  cfg.lastSyncedLocalHash = localHash;
  cfg.lastSyncedCloudRevision = manifest.revision;
  cfg.lastSyncedCloudAt = manifest.updatedAt || nowIso;
  cfg.lastLocalHash = localHash;
  cfg.lastLocalRevision = Math.max(cfg.lastLocalRevision || 0, manifest.revision);
  cfg.lastLocalUpdatedAt = nowIso;
  cfg.lastSyncAt = nowIso;
  cfg.lastSyncSummary = summary;
  writeDualDbStoredConfig(cfg);
  clearCloudManifestCache();
};

export const resetPrismaConnectionPool = (): void => {
  global.__kpimsDbReachable = undefined;
  global.__kpimsLastDbError = undefined;
  global.__kpimsLastProbeFailedAt = undefined;
  global.__kpimsSchemaReadyUrl = undefined;
  global.__kpimsSchemaEnsurePromise = undefined;
  global.__kpimsCloudManifestCache = undefined;
  const existing = global.__prismaClient;
  global.__prismaClient = undefined;
  if (existing) {
    try {
      existing.$disconnect().catch(() => {});
    } catch {
      // ignore
    }
  }
};

export const recordDualDbSyncResult = (summary: string): void => {
  const cfg = readDualDbStoredConfig();
  cfg.lastSyncAt = new Date().toISOString();
  cfg.lastSyncSummary = summary;
  writeDualDbStoredConfig(cfg);
};

const getEffectiveRawDatabaseUrl = (): string => {
  const cfg = readDualDbStoredConfig();
  if (cfg.activeTarget === 'HYBRID_DISK') {
    return '';
  }
  if (cfg.activeTarget === 'LOCAL') {
    if (isValidPostgresUrlSyntax(cfg.localDbUrl)) {
      const enriched = enrichPoolerParameters(cfg.localDbUrl);
      process.env.DATABASE_URL = enriched;
      return enriched;
    }
    return '';
  }
  if (cfg.activeTarget === 'CLOUD') {
    if (isValidPostgresUrlSyntax(cfg.cloudDbUrl)) {
      const enriched = enrichPoolerParameters(cfg.cloudDbUrl);
      process.env.DATABASE_URL = enriched;
      return enriched;
    }
    return '';
  }

  // AUTO: prefer configured Local DB first if present, then Cloud DB, then .env / env
  if (isValidPostgresUrlSyntax(cfg.localDbUrl)) {
    const enriched = enrichPoolerParameters(cfg.localDbUrl);
    process.env.DATABASE_URL = enriched;
    return enriched;
  }
  if (isValidPostgresUrlSyntax(cfg.cloudDbUrl)) {
    const enriched = enrichPoolerParameters(cfg.cloudDbUrl);
    process.env.DATABASE_URL = enriched;
    return enriched;
  }

  const fromFile = readDatabaseUrlFromDotEnv();
  if (fromFile && fromFile !== DEFAULT_FALLBACK_PG_URL) {
    const enriched = enrichPoolerParameters(fromFile);
    process.env.DATABASE_URL = enriched;
    return enriched;
  }
  const fromEnv = normalizePgUrl(process.env.DATABASE_URL);
  if (
    fromEnv &&
    fromEnv !== DEFAULT_FALLBACK_PG_URL &&
    !fromEnv.includes('@localhost:') &&
    !fromEnv.includes('@127.0.0.1:')
  ) {
    return enrichPoolerParameters(fromEnv);
  }
  return fromFile || fromEnv;
};

export const isDatabaseUrlSyntaxValid = (): boolean => {
  const rawUrl = getEffectiveRawDatabaseUrl();
  return isValidPostgresUrlSyntax(rawUrl);
};

export const markDatabaseUnreachable = (reason?: unknown): void => {
  const msg = reason instanceof Error ? reason.message : String(reason || '');
  global.__kpimsLastDbError = msg;
  global.__kpimsDbReachable = false;
  global.__kpimsLastProbeFailedAt = Date.now();
  const existing = global.__prismaClient;
  global.__prismaClient = undefined;
  if (existing) {
    try {
      existing.$disconnect().catch(() => {});
    } catch {
      // ignore
    }
  }
};

export const isDatabaseUrlConfigured = (): boolean => {
  if (global.__kpimsDbReachable !== true) return false;
  return isDatabaseUrlSyntaxValid();
};

function buildPgStartupMessage(user: string, database: string): Buffer {
  const payload = Buffer.from(`user\0${user}\0database\0${database}\0\0`, 'utf8');
  const buf = Buffer.alloc(8 + payload.length);
  buf.writeInt32BE(8 + payload.length, 0);
  buf.writeInt32BE(196608, 4);
  payload.copy(buf, 8);
  return buf;
}

async function probePostgresWireProtocol(rawUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    const user = decodeURIComponent(parsed.username || 'postgres');
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
    const startupPacket = buildPgStartupMessage(user, database);
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    const preferSslFirst =
      !isLocalhostUrl(rawUrl) ||
      sslMode === 'require' ||
      sslMode === 'verify-ca' ||
      sslMode === 'verify-full';

    const connectOpts: net.NetConnectOpts = {
      host,
      port,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 600,
    } as any;

    const tryPlainStartup = (): Promise<'OK' | 'SSL_REQUIRED' | 'FAIL'> =>
      new Promise(resolve => {
        let settled = false;
        const done = (val: 'OK' | 'SSL_REQUIRED' | 'FAIL') => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            socket.destroy();
          } catch {
            // ignore
          }
          resolve(val);
        };

        const socket = net.createConnection(connectOpts);
        const timer = setTimeout(() => done('FAIL'), timeoutMs);

        socket.once('connect', () => {
          socket.write(startupPacket);
        });

        socket.once('data', (chunk: Buffer) => {
          if (!chunk || chunk.length === 0) return done('FAIL');
          const firstByte = String.fromCharCode(chunk[0]);
          if (firstByte === 'R' || firstByte === 'N') {
            return done('OK');
          }
          const text = chunk.toString('utf8');
          if (firstByte === 'E' && /ssl|encryption/i.test(text) && !/ENOTFOUND|tenant\/user/i.test(text)) {
            return done('SSL_REQUIRED');
          }
          return done('FAIL');
        });

        socket.once('error', () => done('FAIL'));
        socket.once('close', () => done('FAIL'));
      });

    const trySslStartup = (): Promise<'OK' | 'SSL_NOT_SUPPORTED' | 'FAIL'> =>
      new Promise(resolve => {
        let settled = false;
        const socket = net.createConnection(connectOpts);
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              socket.destroy();
            } catch {
              // ignore
            }
            resolve('FAIL');
          }
        }, timeoutMs);

        const finish = (ok: 'OK' | 'SSL_NOT_SUPPORTED' | 'FAIL', stream?: net.Socket | tls.TLSSocket) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            stream?.destroy();
            socket.destroy();
          } catch {
            // ignore
          }
          resolve(ok);
        };

        socket.once('connect', () => {
          const sslReq = Buffer.alloc(8);
          sslReq.writeInt32BE(8, 0);
          sslReq.writeInt32BE(80877103, 4);
          socket.write(sslReq);
        });

        socket.once('data', (chunk: Buffer) => {
          if (!chunk || chunk.length === 0) return finish('FAIL');
          const code = String.fromCharCode(chunk[0]);
          if (code === 'N') {
            return finish('SSL_NOT_SUPPORTED');
          }
          if (code !== 'S') {
            return finish('FAIL');
          }
          const tlsSocket = tls.connect(
            { socket, servername: host, rejectUnauthorized: false },
            () => {
              tlsSocket.write(startupPacket);
            }
          );
          tlsSocket.once('data', (tlsChunk: Buffer) => {
            if (!tlsChunk || tlsChunk.length === 0) return finish('FAIL', tlsSocket);
            const tlsCode = String.fromCharCode(tlsChunk[0]);
            finish(tlsCode === 'R' || tlsCode === 'N' ? 'OK' : 'FAIL', tlsSocket);
          });
          tlsSocket.once('error', () => finish('FAIL', tlsSocket));
        });

        socket.once('error', () => finish('FAIL'));
        socket.once('close', () => finish('FAIL'));
      });

    if (preferSslFirst) {
      const sslRes = await trySslStartup();
      if (sslRes === 'OK') return true;
      if (sslRes === 'SSL_NOT_SUPPORTED') {
        return (await tryPlainStartup()) === 'OK';
      }
      return false;
    }

    const plainRes = await tryPlainStartup();
    if (plainRes === 'OK') return true;
    if (plainRes === 'SSL_REQUIRED') {
      return (await trySslStartup()) === 'OK';
    }
    return false;
  } catch {
    return false;
  }
}

export async function testSingleDatabaseUrl(rawUrl: string, timeoutMs = 6000): Promise<{
  success: boolean;
  isValidSyntax: boolean;
  isConnected: boolean;
  latencyMs: number;
  maskedUrl: string;
  message: string;
  error?: string;
}> {
  const normalized = normalizePgUrl(rawUrl);
  const maskedUrl = maskDatabaseUrl(normalized);
  if (!isValidPostgresUrlSyntax(normalized)) {
    return {
      success: false,
      isValidSyntax: false,
      isConnected: false,
      latencyMs: 0,
      maskedUrl,
      message: 'فرمت رشته اتصال PostgreSQL معتبر نیست (نمونه: postgresql://user:pass@host:5432/db).',
      error: 'INVALID_URL_SYNTAX',
    };
  }

  const start = Date.now();
  const enriched = enrichPoolerParameters(normalized);
  try {
    const wireOk = await probePostgresWireProtocol(enriched, timeoutMs);
    if (!wireOk) {
      return {
        success: false,
        isValidSyntax: true,
        isConnected: false,
        latencyMs: Date.now() - start,
        maskedUrl,
        message: 'سرور PostgreSQL روی این آدرس در دسترس نیست یا پاسخ Wire-Protocol را رد کرد.',
        error: 'WIRE_PROTOCOL_UNREACHABLE',
      };
    }

    const tempClient = new PrismaClient({
      datasources: { db: { url: enriched } },
      log: [],
    });
    try {
      await Promise.race([
        tempClient.$queryRaw`SELECT 1 as ok`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection test timeout')), timeoutMs)),
      ]);
      const latencyMs = Date.now() - start;
      clearCloudManifestCache();
      return {
        success: true,
        isValidSyntax: true,
        isConnected: true,
        latencyMs,
        maskedUrl,
        message: `اتصال به پایگاه داده با موفقیت برقرار شد (${latencyMs} ms).`,
      };
    } finally {
      await tempClient.$disconnect().catch(() => {});
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      isValidSyntax: true,
      isConnected: false,
      latencyMs: Date.now() - start,
      maskedUrl,
      message: `خطا در احراز هویت یا کوئری آزمایشی پایگاه داده: ${errMsg.slice(0, 140)}`,
      error: errMsg,
    };
  }
}

export async function saveDualDbConfig(input: {
  localDbUrl?: string;
  cloudDbUrl?: string;
  activeTarget?: DbTargetMode;
  autoCheckCloudUpdates?: boolean;
  cloudCheckIntervalSec?: number;
  deviceLabel?: string;
}): Promise<DualDbPublicStatus> {
  const existing = readDualDbStoredConfig();
  const resolveUrlUpdate = (incoming: string | undefined, prev: string): string => {
    if (incoming === undefined) return prev;
    const trimmed = normalizePgUrl(incoming);
    if (!trimmed) return '';
    // Keep stored secret if user submitted the masked placeholder unchanged
    if (trimmed.includes(':****@') && prev && maskDatabaseUrl(prev) === trimmed) {
      return prev;
    }
    return trimmed;
  };

  const intervalVal =
    typeof input.cloudCheckIntervalSec === 'number' && Number.isFinite(input.cloudCheckIntervalSec)
      ? Math.max(30, Math.min(3600, Math.round(input.cloudCheckIntervalSec)))
      : existing.cloudCheckIntervalSec ?? 120;

  const nextConfig: DualDbStoredConfig = {
    ...existing,
    localDbUrl: resolveUrlUpdate(input.localDbUrl, existing.localDbUrl),
    cloudDbUrl: resolveUrlUpdate(input.cloudDbUrl, existing.cloudDbUrl),
    activeTarget:
      input.activeTarget && ['AUTO', 'LOCAL', 'CLOUD', 'HYBRID_DISK'].includes(input.activeTarget)
        ? input.activeTarget
        : existing.activeTarget,
    autoCheckCloudUpdates:
      typeof input.autoCheckCloudUpdates === 'boolean'
        ? input.autoCheckCloudUpdates
        : Boolean(existing.autoCheckCloudUpdates),
    cloudCheckIntervalSec: intervalVal,
    deviceLabel:
      typeof input.deviceLabel === 'string' && input.deviceLabel.trim()
        ? input.deviceLabel.trim().slice(0, 48)
        : existing.deviceLabel || getDefaultDeviceLabel(),
    updatedAt: new Date().toISOString(),
  };

  const connectionChanged =
    nextConfig.localDbUrl !== existing.localDbUrl ||
    nextConfig.cloudDbUrl !== existing.cloudDbUrl ||
    nextConfig.activeTarget !== existing.activeTarget;

  writeDualDbStoredConfig(nextConfig);
  clearCloudManifestCache();
  if (connectionChanged) {
    resetPrismaConnectionPool();
    await probeDatabaseConnectivity(4000, true);
  }
  return getDualDbPublicStatus(false);
}

export async function getDualDbPublicStatus(probeLinks = false): Promise<DualDbPublicStatus> {
  const cfg = readDualDbStoredConfig();
  const localValid = isValidPostgresUrlSyntax(cfg.localDbUrl);
  const cloudValid = isValidPostgresUrlSyntax(cfg.cloudDbUrl);

  let localStatus: SingleDbLinkStatus = {
    isConfigured: localValid,
    isConnected: false,
    maskedUrl: maskDatabaseUrl(cfg.localDbUrl),
    databaseType: 'PostgreSQL',
  };
  let cloudStatus: SingleDbLinkStatus = {
    isConfigured: cloudValid,
    isConnected: false,
    maskedUrl: maskDatabaseUrl(cfg.cloudDbUrl),
    databaseType: 'PostgreSQL',
  };

  if (probeLinks) {
    const [localProbe, cloudProbe] = await Promise.all([
      localValid ? testSingleDatabaseUrl(cfg.localDbUrl, 2500) : Promise.resolve(null),
      cloudValid ? testSingleDatabaseUrl(cfg.cloudDbUrl, 2500) : Promise.resolve(null),
    ]);
    if (localProbe) {
      localStatus = {
        isConfigured: localValid,
        isConnected: localProbe.isConnected,
        maskedUrl: localProbe.maskedUrl,
        databaseType: 'PostgreSQL',
        lastError: localProbe.isConnected ? undefined : localProbe.message,
        latencyMs: localProbe.latencyMs,
      };
    }
    if (cloudProbe) {
      cloudStatus = {
        isConfigured: cloudValid,
        isConnected: cloudProbe.isConnected,
        maskedUrl: cloudProbe.maskedUrl,
        databaseType: 'PostgreSQL',
        lastError: cloudProbe.isConnected ? undefined : cloudProbe.message,
        latencyMs: cloudProbe.latencyMs,
      };
    }
  } else {
    const eff = getEffectiveRawDatabaseUrl();
    const effConnected = global.__kpimsDbReachable === true;
    if (eff && cfg.localDbUrl && eff.startsWith(cfg.localDbUrl.split('?')[0])) {
      localStatus.isConnected = effConnected;
    }
    if (eff && cfg.cloudDbUrl && eff.startsWith(cfg.cloudDbUrl.split('?')[0])) {
      cloudStatus.isConnected = effConnected;
    }
  }

  let resolvedTarget: 'LOCAL' | 'CLOUD' | 'HYBRID_DISK' = 'HYBRID_DISK';
  if (cfg.activeTarget !== 'HYBRID_DISK' && global.__kpimsDbReachable === true) {
    const eff = getEffectiveRawDatabaseUrl();
    if (cfg.activeTarget === 'LOCAL' || (eff && cfg.localDbUrl && eff.startsWith(cfg.localDbUrl.split('?')[0]))) {
      resolvedTarget = 'LOCAL';
    } else if (cfg.activeTarget === 'CLOUD' || (eff && cfg.cloudDbUrl && eff.startsWith(cfg.cloudDbUrl.split('?')[0]))) {
      resolvedTarget = 'CLOUD';
    }
  }

  return {
    localDbUrlMasked: maskDatabaseUrl(cfg.localDbUrl),
    cloudDbUrlMasked: maskDatabaseUrl(cfg.cloudDbUrl),
    hasLocalDbUrl: Boolean(cfg.localDbUrl),
    hasCloudDbUrl: Boolean(cfg.cloudDbUrl),
    activeTarget: cfg.activeTarget,
    resolvedTarget,
    autoCheckCloudUpdates: Boolean(cfg.autoCheckCloudUpdates),
    cloudCheckIntervalSec: cfg.cloudCheckIntervalSec || 120,
    deviceLabel: cfg.deviceLabel || getDefaultDeviceLabel(),
    lastSyncedCloudHash: cfg.lastSyncedCloudHash,
    lastSyncedCloudRevision: cfg.lastSyncedCloudRevision,
    lastSyncedCloudAt: cfg.lastSyncedCloudAt,
    lastLocalHash: cfg.lastLocalHash,
    lastLocalRevision: cfg.lastLocalRevision,
    lastSyncAt: cfg.lastSyncAt,
    lastSyncSummary: cfg.lastSyncSummary,
    updatedAt: cfg.updatedAt,
    localStatus,
    cloudStatus,
  };
}

export async function probeDatabaseConnectivity(timeoutMs = 4500, force = false): Promise<boolean> {
  if (!isDatabaseUrlSyntaxValid()) {
    global.__kpimsDbReachable = false;
    return false;
  }

  if (
    !force &&
    global.__kpimsDbReachable === false &&
    global.__kpimsLastProbeFailedAt &&
    Date.now() - global.__kpimsLastProbeFailedAt < PROBE_COOLDOWN_MS
  ) {
    return false;
  }

  const rawUrl = getEffectiveRawDatabaseUrl();
  try {
    const wireOk = await probePostgresWireProtocol(rawUrl, timeoutMs);
    if (!wireOk) {
      markDatabaseUnreachable('PostgreSQL wire-protocol preflight rejected or tenant paused');
      return false;
    }

    const realClient = getOrCreateRealPrismaClient();
    await Promise.race([
      realClient.$queryRaw`SELECT 1 as ok`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB probe timeout')), timeoutMs)),
    ]);
    global.__kpimsDbReachable = true;
    global.__kpimsLastDbError = undefined;
    global.__kpimsLastProbeFailedAt = undefined;
    return true;
  } catch (err) {
    markDatabaseUnreachable(err);
    return false;
  }
}

export const resolveDatabaseUrl = (): string => {
  const rawUrl = getEffectiveRawDatabaseUrl();
  if (isDatabaseUrlSyntaxValid()) {
    process.env.DATABASE_URL = enrichPoolerParameters(rawUrl);
    return process.env.DATABASE_URL;
  }
  return DEFAULT_FALLBACK_PG_URL;
};

function getOrCreateRealPrismaClient(): PrismaClient {
  if (!global.__prismaClient) {
    const dbUrl = resolveDatabaseUrl();

    const client = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    (client as any).$on('error', (e: any) => {
      const msg = String(e?.message || '');
      global.__kpimsLastDbError = msg;
      if (
        msg.includes('Closed') ||
        msg.includes('kind: Closed') ||
        msg.includes('E57P01') ||
        msg.includes('terminating connection') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('tenant/user') ||
        msg.includes('P1001') ||
        msg.includes('P1002') ||
        msg.includes('P1017')
      ) {
        markDatabaseUnreachable(msg);
      }
    });

    (client as any).$on('warn', () => {
      // suppress warnings
    });

    global.__prismaClient = client;
  }
  return global.__prismaClient;
}

const createOfflineModelDelegate = (): any =>
  new Proxy(() => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE')), {
    get(_target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      return () => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
    },
    apply() {
      return Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
    },
  });

export const getPrismaClient = (): PrismaClient => {
  if (!global.__prismaProxy) {
    const offlineDelegate = createOfflineModelDelegate();
    const embeddedDelegates: Record<string, any> = {};
    for (const [modelName, storeKey] of Object.entries(EMBEDDED_MODEL_MAP)) {
      embeddedDelegates[modelName] = createEmbeddedTableDelegate(storeKey);
    }

    global.__prismaProxy = new Proxy({} as PrismaClient, {
      get(_target, prop: string | symbol) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined;
        }
        if (global.__kpimsDbReachable === true) {
          const client = getOrCreateRealPrismaClient() as any;
          const val = client[prop];
          return typeof val === 'function' ? val.bind(client) : val;
        }
        if (typeof prop === 'string' && prop in embeddedDelegates) {
          return embeddedDelegates[prop];
        }
        if (prop === '$on' || prop === '$use' || prop === '$extends') {
          return () => global.__prismaProxy;
        }
        if (prop === '$connect' || prop === '$disconnect') {
          return () => Promise.resolve();
        }
        if (
          prop === '$transaction' ||
          prop === '$queryRaw' ||
          prop === '$queryRawUnsafe' ||
          prop === '$executeRaw' ||
          prop === '$executeRawUnsafe'
        ) {
          return () => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
        }
        return offlineDelegate;
      },
    });
  }
  return global.__prismaProxy;
};

export interface DatabaseStatus {
  isConfigured: boolean;
  isConnected: boolean;
  isDurableStorageActive?: boolean;
  databaseType: 'SQLite' | 'PostgreSQL';
  databaseUrlMasked: string;
  storageMode?: 'POSTGRESQL_LIVE' | 'HYBRID_DURABLE_DISK';
  errorMessage?: string;
  lastChecked: string;
  dualLinks?: DualDbPublicStatus;
}

export async function checkDatabaseConnection(probeAllLinks = false): Promise<DatabaseStatus> {
  const rawUrl = resolveDatabaseUrl();
  const maskedUrl = maskDatabaseUrl(rawUrl);
  const dbType: 'SQLite' | 'PostgreSQL' =
    rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://') ? 'PostgreSQL' : 'SQLite';
  const hasConfiguredUrl = isDatabaseUrlSyntaxValid();

  if (global.__kpimsDbReachable !== true) {
    await probeDatabaseConnectivity(3500, false);
  }

  const dualLinks = await getDualDbPublicStatus(probeAllLinks);

  if (global.__kpimsDbReachable === true) {
    return {
      isConfigured: true,
      isConnected: true,
      isDurableStorageActive: false,
      databaseType: dbType,
      databaseUrlMasked: maskedUrl,
      storageMode: 'POSTGRESQL_LIVE',
      lastChecked: new Date().toISOString(),
      dualLinks,
    };
  }

  const reasonSummary = global.__kpimsLastDbError
    ? `اتصال به پایگاه داده PostgreSQL برقرار نشد (${global.__kpimsLastDbError.slice(0, 120)}). موتور پایدار دیسک محلی (HYBRID_DURABLE_DISK) با ذخیره خودکار فعال است.`
    : 'آدرس PostgreSQL معتبر برای لینک فعال تنظیم نشده یا در دسترس نیست؛ موتور پایدار دیسک محلی (HYBRID_DURABLE_DISK) با ذخیره خودکار فعال است.';

  return {
    isConfigured: hasConfiguredUrl,
    isConnected: false,
    isDurableStorageActive: true,
    databaseType: dbType,
    databaseUrlMasked: maskedUrl,
    storageMode: 'HYBRID_DURABLE_DISK',
    errorMessage: reasonSummary,
    lastChecked: new Date().toISOString(),
    dualLinks,
  };
}

export const isMissingRelationError = (err: unknown): boolean => {
  if (!err) return false;
  const code = typeof err === 'object' && err !== null ? (err as any).code : undefined;
  if (code === 'P2021' || code === 'P2022' || code === '42P01') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /does not exist in the current database/i.test(msg) ||
    /relation ".*" does not exist/i.test(msg) ||
    /P2021/.test(msg) ||
    /42P01/.test(msg)
  );
};

async function runPrismaDbPush(dbUrl: string): Promise<{ ok: boolean; error?: string }> {
  const isWin = process.platform === 'win32';
  const localPrismaBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    isWin ? 'prisma.cmd' : 'prisma',
  );
  const cmd = fs.existsSync(localPrismaBin) ? localPrismaBin : (isWin ? 'npx.cmd' : 'npx');
  const args = fs.existsSync(localPrismaBin)
    ? ['db', 'push', '--skip-generate', '--accept-data-loss']
    : ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'];

  return new Promise(resolve => {
    execFile(
      cmd,
      args,
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: dbUrl },
        timeout: 45_000,
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: (stderr || error.message || 'prisma db push failed').slice(0, 300) });
        }
      },
    );
  });
}

export async function ensurePostgresSchemaReady(
  force = false,
): Promise<{ ready: boolean; autoPushed: boolean; snapshotOnly: boolean; error?: string }> {
  if (!isDatabaseUrlConfigured()) {
    return { ready: false, autoPushed: false, snapshotOnly: false };
  }

  const activeUrl = resolveDatabaseUrl();
  if (!force && global.__kpimsSchemaReadyUrl === activeUrl) {
    return { ready: true, autoPushed: false, snapshotOnly: false };
  }

  if (global.__kpimsSchemaEnsurePromise) {
    return global.__kpimsSchemaEnsurePromise;
  }

  const run = async (): Promise<{ ready: boolean; autoPushed: boolean; snapshotOnly: boolean; error?: string }> => {
    try {
      const client = getOrCreateRealPrismaClient();
      const checkTables = async () => {
        const rows = (await client.$queryRawUnsafe(
          `SELECT to_regclass('public.units_of_measure')::text AS uom, to_regclass('public.parts')::text AS parts, to_regclass('public.materials')::text AS materials, to_regclass('public.inventory_app_state_snapshots')::text AS snap`,
        )) as Array<{ uom: string | null; parts: string | null; materials: string | null; snap: string | null }>;
        return rows?.[0] || { uom: null, parts: null, materials: null, snap: null };
      };

      const initial = await checkTables();
      if (initial.uom && initial.parts && initial.materials && initial.snap) {
        global.__kpimsSchemaReadyUrl = activeUrl;
        return { ready: true, autoPushed: false, snapshotOnly: false };
      }

      console.warn('[KPIMS DB] Missing relational schema detected in PostgreSQL; running automatic prisma db push...');
      const pushRes = await runPrismaDbPush(activeUrl);
      if (pushRes.ok) {
        const after = await checkTables();
        if (after.uom && after.parts && after.materials) {
          global.__kpimsSchemaReadyUrl = activeUrl;
          console.info('[KPIMS DB] Automatic prisma db push completed successfully.');
          return { ready: true, autoPushed: true, snapshotOnly: false };
        }
      }

      // Ensure snapshot table at minimum so durable state syncs even if full relational DDL lacks privileges
      let snapshotOk = Boolean(initial.snap);
      if (!snapshotOk) {
        try {
          await client.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "inventory_app_state_snapshots" ("id" TEXT NOT NULL PRIMARY KEY, "payload" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
          );
          snapshotOk = true;
        } catch {
          snapshotOk = false;
        }
      }

      return {
        ready: false,
        autoPushed: false,
        snapshotOnly: snapshotOk,
        error: pushRes.error || 'جداول رابطه‌ای PostgreSQL (مانند units_of_measure و parts) در این پایگاه داده ایجاد نشده‌اند.',
      };
    } catch (err) {
      return {
        ready: false,
        autoPushed: false,
        snapshotOnly: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      global.__kpimsSchemaEnsurePromise = undefined;
    }
  };

  global.__kpimsSchemaEnsurePromise = run();
  return global.__kpimsSchemaEnsurePromise;
}

/**
 * Execute operations against an arbitrary PostgreSQL URL (e.g., Cloud DB while actively working on Local DB).
 * Background polling keeps a fast Wire-Protocol preflight so unreachable remote databases drop quietly;
 * explicit user Push / Pull / manual Fetch bypasses raw-socket veto so Prisma connects directly with full TLS/timeout handling.
 */
export async function withScopedPgClient<T>(
  rawUrl: string,
  timeoutMs: number,
  fn: (client: PrismaClient, enrichedUrl: string) => Promise<T>,
  options?: { skipWireProbe?: boolean; probeTimeoutMs?: number },
): Promise<T> {
  const normalized = normalizePgUrl(rawUrl);
  if (!isValidPostgresUrlSyntax(normalized)) {
    throw new Error('آدرس اتصال PostgreSQL معتبر نیست.');
  }
  const enriched = enrichPoolerParameters(normalized);

  if (!options?.skipWireProbe) {
    const probeMs = Math.min(timeoutMs, options?.probeTimeoutMs ?? 6000);
    const wireOk = await probePostgresWireProtocol(enriched, probeMs);
    if (!wireOk) {
      throw new Error('سرور PostgreSQL مقصد در این لحظه در دسترس نیست (Wire-Protocol Unreachable).');
    }
  }

  const client = new PrismaClient({
    datasources: { db: { url: enriched } },
    log: [],
  });
  try {
    return await Promise.race([
      fn(client, enriched),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('مهلت زمانی عملیات پایگاه داده به پایان رسید.')), timeoutMs)
      ),
    ]);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

export async function ensureTargetSnapshotTables(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "inventory_app_state_snapshots" ("id" TEXT NOT NULL PRIMARY KEY, "payload" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await client.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "wip_state_snapshots" ("id" TEXT NOT NULL PRIMARY KEY, "payload" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
}

export async function ensureTargetFullSchemaBestEffort(client: PrismaClient, targetUrl: string): Promise<boolean> {
  await ensureTargetSnapshotTables(client);
  try {
    const rows = (await client.$queryRawUnsafe(
      `SELECT to_regclass('public.units_of_measure')::text AS uom, to_regclass('public.parts')::text AS parts`,
    )) as Array<{ uom: string | null; parts: string | null }>;
    if (rows?.[0]?.uom && rows?.[0]?.parts) {
      return true;
    }
    const pushed = await runPrismaDbPush(targetUrl);
    if (pushed.ok) {
      return true;
    }
  } catch {
    // Fallback to snapshots only
  }
  return false;
}

const MANIFEST_CACHE_TTL_MS = 25_000;

export async function fetchCloudSyncManifestLightweight(
  force = false,
  timeoutMs = force ? 12_000 : 6000,
): Promise<{
  cloudConfigured: boolean;
  cloudReachable: boolean;
  cached: boolean;
  checkedAt: string;
  latencyMs?: number;
  manifest: CloudSyncManifest | null;
  hasLegacySnapshot: boolean;
  legacyUpdatedAt?: string;
  error?: string;
}> {
  const cfg = readDualDbStoredConfig();
  const cloudConfigured = isValidPostgresUrlSyntax(cfg.cloudDbUrl);
  if (!cloudConfigured) {
    return {
      cloudConfigured: false,
      cloudReachable: false,
      cached: false,
      checkedAt: new Date().toISOString(),
      manifest: null,
      hasLegacySnapshot: false,
    };
  }

  const nowMs = Date.now();
  const cachedEntry = global.__kpimsCloudManifestCache;
  if (
    !force &&
    cachedEntry &&
    cachedEntry.cloudUrl === cfg.cloudDbUrl &&
    nowMs - cachedEntry.checkedAtMs < MANIFEST_CACHE_TTL_MS
  ) {
    return {
      cloudConfigured: true,
      cloudReachable: cachedEntry.reachable,
      cached: true,
      checkedAt: cachedEntry.checkedAtIso,
      latencyMs: cachedEntry.latencyMs,
      manifest: cachedEntry.manifest,
      hasLegacySnapshot: cachedEntry.hasLegacySnapshot,
      error: cachedEntry.error,
    };
  }

  const started = Date.now();
  const checkedAtIso = new Date().toISOString();
  try {
    const result = await withScopedPgClient(
      cfg.cloudDbUrl,
      timeoutMs,
      async client => {
        try {
          const rows = (await client.$queryRawUnsafe(
            `SELECT "id", CASE WHEN "id" = $1 THEN "payload" ELSE NULL END AS "payload", "updatedAt" FROM "inventory_app_state_snapshots" WHERE "id" IN ($1, 'inventory-app-state')`,
            CLOUD_SYNC_MANIFEST_ID,
          )) as Array<{ id: string; payload: any; updatedAt: Date | string }>;

          const manifestRow = rows?.find(r => r.id === CLOUD_SYNC_MANIFEST_ID && r.payload);
          const legacyRow = rows?.find(r => r.id === 'inventory-app-state');

          if (manifestRow) {
            const p = typeof manifestRow.payload === 'string'
              ? JSON.parse(manifestRow.payload)
              : manifestRow.payload;
            return {
              manifest: p as CloudSyncManifest,
              hasLegacySnapshot: true,
              legacyUpdatedAt: manifestRow.updatedAt ? new Date(manifestRow.updatedAt).toISOString() : undefined,
            };
          }

          return {
            manifest: null as CloudSyncManifest | null,
            hasLegacySnapshot: Boolean(legacyRow),
            legacyUpdatedAt: legacyRow?.updatedAt ? new Date(legacyRow.updatedAt).toISOString() : undefined,
          };
        } catch (queryErr) {
          if (isMissingRelationError(queryErr)) {
            return {
              manifest: null as CloudSyncManifest | null,
              hasLegacySnapshot: false,
              legacyUpdatedAt: undefined as string | undefined,
            };
          }
          throw queryErr;
        }
      },
      { skipWireProbe: force, probeTimeoutMs: 6000 },
    );

    const latencyMs = Date.now() - started;
    global.__kpimsCloudManifestCache = {
      cloudUrl: cfg.cloudDbUrl,
      checkedAtMs: Date.now(),
      checkedAtIso,
      reachable: true,
      latencyMs,
      manifest: result.manifest,
      hasLegacySnapshot: result.hasLegacySnapshot,
    };
    return {
      cloudConfigured: true,
      cloudReachable: true,
      cached: false,
      checkedAt: checkedAtIso,
      latencyMs,
      manifest: result.manifest,
      hasLegacySnapshot: result.hasLegacySnapshot,
      legacyUpdatedAt: result.legacyUpdatedAt,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const error = err instanceof Error ? err.message : String(err);
    global.__kpimsCloudManifestCache = {
      cloudUrl: cfg.cloudDbUrl,
      checkedAtMs: Date.now(),
      checkedAtIso,
      reachable: false,
      latencyMs,
      manifest: null,
      hasLegacySnapshot: false,
      error,
    };
    return {
      cloudConfigured: true,
      cloudReachable: false,
      cached: false,
      checkedAt: checkedAtIso,
      latencyMs,
      manifest: null,
      hasLegacySnapshot: false,
      error,
    };
  }
}


