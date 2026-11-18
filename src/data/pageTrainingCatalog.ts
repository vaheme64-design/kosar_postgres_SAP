export type {
  PageButtonGuideItem,
  PageKeyTermItem,
  PageScenarioGuideItem,
  PageSectionGuideItem,
  PageTrainingEntry,
} from './guideTypes';

import { PageTrainingEntry } from './guideTypes';
import { CORE_AND_CONTRACTS_GUIDES } from './guides/coreAndContractsGuides';
import { MASTER_DATA_GUIDES } from './guides/masterDataGuides';
import { INVENTORY_AND_SAPCO_GUIDES } from './guides/inventoryAndSapcoGuides';
import { PLANNING_AND_PRODUCTION_GUIDES } from './guides/planningAndProductionGuides';
import { WIP_AND_MACHINES_GUIDES } from './guides/wipAndMachinesGuides';
import { REPORTS_BASE_ENTRY, REPORT_SUB_DETAILS } from './guides/reportsGuides';
import { SETTINGS_GUIDES } from './guides/settingsGuides';

export { REPORT_SUB_DETAILS };

export const REPORT_TRAINING_ENTRIES: PageTrainingEntry[] = Object.entries(REPORT_SUB_DETAILS).map(
  ([reportKey, rep]) => ({
    key: `reports:${reportKey}`,
    tab: 'reports',
    subTab: reportKey,
    moduleGroup: 'گزارش‌های تحلیلی، شاخص‌ها و OEE',
    title: `${rep.title} (مرکز گزارش‌های مدیریتی)`,
    sapRef: `BI Report · ${reportKey}`,
    shortGoal: rep.goal,
    fullPurpose: rep.fullPurpose,
    keyTerms: rep.keyTerms,
    sections: [...rep.sections, ...REPORTS_BASE_ENTRY.sections.slice(0, 2)],
    buttonsAndLinks: [...rep.specificButtons, ...REPORTS_BASE_ENTRY.buttonsAndLinks],
    scenarios: rep.scenarios,
    operatorSteps: rep.operatorSteps,
    dataQualityRule: rep.dataQualityRule,
  }),
);

export const PAGE_TRAINING_CATALOG: PageTrainingEntry[] = [
  ...CORE_AND_CONTRACTS_GUIDES,
  ...MASTER_DATA_GUIDES,
  ...INVENTORY_AND_SAPCO_GUIDES,
  ...PLANNING_AND_PRODUCTION_GUIDES,
  ...WIP_AND_MACHINES_GUIDES,
  REPORTS_BASE_ENTRY,
  ...REPORT_TRAINING_ENTRIES,
  ...SETTINGS_GUIDES,
];

export function resolvePageTrainingEntry(params: {
  tab: string;
  masterSubSection?: string;
  inventorySubTab?: string;
  planningSubTab?: string;
  productionViewMode?: 'ERP_WORKBENCH' | 'VOUCHERS';
  productionModuleTab?: string;
  wipSubTab?: string;
  machineSubTab?: string;
  contractsSubTab?: string;
  settingsSubTab?: string;
  reportSubTab?: string;
}): PageTrainingEntry {
  const {
    tab,
    masterSubSection,
    inventorySubTab,
    planningSubTab,
    productionViewMode,
    productionModuleTab,
    wipSubTab,
    machineSubTab,
    contractsSubTab,
    settingsSubTab,
    reportSubTab,
  } = params;

  let candidateKey = tab;
  if (tab === 'master_data') candidateKey = `master_data:${masterSubSection || 'PARTS'}`;
  else if (tab === 'contracts') candidateKey = `contracts:${contractsSubTab || 'CONTRACTS_QUOTAS'}`;
  else if (tab === 'inventory') candidateKey = `inventory:${inventorySubTab || 'DASHBOARD'}`;
  else if (tab === 'planning') {
    candidateKey = `planning:${planningSubTab === 'erp_workbench' ? 'mrp' : planningSubTab || 'mrp'}`;
  } else if (tab === 'production') {
    candidateKey =
      productionViewMode === 'VOUCHERS'
        ? 'production:VOUCHERS'
        : `production:${productionModuleTab || 'MULTI_PART_SCHEDULER'}`;
  } else if (tab === 'wip') candidateKey = `wip:${wipSubTab || 'UNIFIED_DIRECTORY'}`;
  else if (tab === 'machines') candidateKey = `machines:${machineSubTab || 'machines'}`;
  else if (tab === 'reports') candidateKey = `reports:${reportSubTab || 'plan_vs_actual'}`;
  else if (tab === 'settings') candidateKey = `settings:${settingsSubTab || 'rbac'}`;

  const exact = PAGE_TRAINING_CATALOG.find(item => item.key === candidateKey);
  if (exact) return exact;

  return PAGE_TRAINING_CATALOG.find(item => item.tab === tab) || PAGE_TRAINING_CATALOG[0];
}
