export interface PageButtonGuideItem {
  label: string;
  kind: 'دکمه اصلی' | 'دکمه ابزاری' | 'لینک ناوبری' | 'فیلتر / انتخابگر' | 'عملیات ردیف جدول';
  purpose: string;
  behindTheScenes?: string;
  whenToUse: string;
}

export interface PageSectionGuideItem {
  name: string;
  purpose: string;
}

export interface PageScenarioGuideItem {
  title: string;
  trigger: string;
  behindTheScenes: string;
  stepByStep: string[];
  expectedResult: string;
  relatedTab?: string;
  relatedSubTab?: string;
}

export interface PageKeyTermItem {
  term: string;
  meaning: string;
}

export interface PageTrainingEntry {
  key: string;
  tab: string;
  subTab?: string;
  moduleGroup: string;
  title: string;
  sapRef: string;
  shortGoal: string;
  fullPurpose: string;
  keyTerms?: PageKeyTermItem[];
  sections: PageSectionGuideItem[];
  buttonsAndLinks: PageButtonGuideItem[];
  scenarios: PageScenarioGuideItem[];
  operatorSteps: string[];
  dataQualityRule: string;
}
