import { UserRoleProfile } from '../types/inventory';

export interface CustomFactoryUser extends UserRoleProfile {
  jobTitle?: string;
  department?: string;
}

export const CUSTOM_USERS_STORAGE_KEY = 'kpims_custom_users_v1';
export const CUSTOM_ROLE_TITLES_STORAGE_KEY = 'kpims_custom_role_titles_v1';
export const ACTIVE_USER_ID_STORAGE_KEY = 'kpims_active_user_id_v1';

export const DEFAULT_ROLE_TITLES: Record<UserRoleProfile['role'], string> = {
  ADMIN: 'مدیر ارشد سیستم و کارخانه',
  PRODUCTION_MANAGER: 'مدیر تولید و برنامه‌ریزی',
  WAREHOUSE_KEEPER: 'مسئول انبار و کنترل موجودی',
  LINE_SUPERVISOR: 'سرپرست سالن تولید و پرس',
  QC_INSPECTOR: 'مسئول کنترل کیفیت (QC)',
};

export const DEFAULT_FACTORY_USERS: CustomFactoryUser[] = [
  {
    uid: 'USR-ADMIN-01',
    displayName: 'مدیر سیستم (قابل ویرایش)',
    jobTitle: 'مدیریت کارخانه',
    department: 'مدیریت ارشد',
    email: 'admin@factory.local',
    role: 'ADMIN',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    uid: 'USR-PROD-01',
    displayName: 'مسئول تولید و برنامه‌ریزی',
    jobTitle: 'برنامه‌ریزی و کنترل تولید (PP/MRP)',
    department: 'واحد تولید',
    email: 'production@factory.local',
    role: 'PRODUCTION_MANAGER',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    uid: 'USR-WH-01',
    displayName: 'مسئول انبار و رول ورق',
    jobTitle: 'انبارداری و مواد (MM)',
    department: 'واحد انبار',
    email: 'warehouse@factory.local',
    role: 'WAREHOUSE_KEEPER',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    uid: 'USR-SUP-01',
    displayName: 'سرپرست سالن پرس و جوش',
    jobTitle: 'سرپرستی شیفت و خطوط تولید',
    department: 'سالن تولید',
    email: 'supervisor@factory.local',
    role: 'LINE_SUPERVISOR',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    uid: 'USR-QC-01',
    displayName: 'مسئول کنترل کیفیت (QC)',
    jobTitle: 'تضمین کیفیت و بازرسی (QM)',
    department: 'واحد کنترل کیفیت',
    email: 'qc@factory.local',
    role: 'QC_INSPECTOR',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function notifyUsersChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kpims-users-updated'));
  }
}

export function loadCustomRoleTitles(): Record<UserRoleProfile['role'], string> {
  if (typeof window === 'undefined') return { ...DEFAULT_ROLE_TITLES };
  try {
    const raw = localStorage.getItem(CUSTOM_ROLE_TITLES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROLE_TITLES };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ROLE_TITLES,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_ROLE_TITLES };
  }
}

export function saveCustomRoleTitles(titles: Record<UserRoleProfile['role'], string>): Record<UserRoleProfile['role'], string> {
  const merged: Record<UserRoleProfile['role'], string> = {
    ...DEFAULT_ROLE_TITLES,
    ...titles,
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_ROLE_TITLES_STORAGE_KEY, JSON.stringify(merged));
    notifyUsersChanged();
  }
  return merged;
}

export function loadCustomUsers(): CustomFactoryUser[] {
  if (typeof window === 'undefined') return DEFAULT_FACTORY_USERS;
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CUSTOM_USERS_STORAGE_KEY, JSON.stringify(DEFAULT_FACTORY_USERS));
      return DEFAULT_FACTORY_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(CUSTOM_USERS_STORAGE_KEY, JSON.stringify(DEFAULT_FACTORY_USERS));
      return DEFAULT_FACTORY_USERS;
    }
    return parsed;
  } catch {
    return DEFAULT_FACTORY_USERS;
  }
}

export function saveCustomUsers(users: CustomFactoryUser[]): CustomFactoryUser[] {
  const safeList = users.length > 0 ? users : DEFAULT_FACTORY_USERS;
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_USERS_STORAGE_KEY, JSON.stringify(safeList));
    notifyUsersChanged();
  }
  return safeList;
}

export function getActiveFactoryUser(): CustomFactoryUser {
  const users = loadCustomUsers();
  if (typeof window === 'undefined') return users[0];

  const savedUid = localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) || localStorage.getItem('kpims_active_uid');
  const found = users.find(u => u.uid === savedUid && u.active !== false) || users.find(u => u.active !== false) || users[0];

  localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, found.uid);
  localStorage.setItem('kpims_active_uid', found.uid);
  localStorage.setItem('kpims_active_role', found.role);
  return found;
}

export function setActiveFactoryUser(uid: string): CustomFactoryUser {
  const users = loadCustomUsers();
  const target = users.find(u => u.uid === uid) || users[0];
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, target.uid);
    localStorage.setItem('kpims_active_uid', target.uid);
    localStorage.setItem('kpims_active_role', target.role);
    notifyUsersChanged();
  }
  return target;
}

export function updateActiveUserRole(role: UserRoleProfile['role']): CustomFactoryUser {
  const users = loadCustomUsers();
  const active = getActiveFactoryUser();
  const updatedList = users.map(u => (u.uid === active.uid ? { ...u, role } : u));
  saveCustomUsers(updatedList);
  const nextActive = updatedList.find(u => u.uid === active.uid) || updatedList[0];
  if (typeof window !== 'undefined') {
    localStorage.setItem('kpims_active_role', role);
    notifyUsersChanged();
  }
  return nextActive;
}

export function upsertCustomUser(user: CustomFactoryUser): CustomFactoryUser[] {
  const users = loadCustomUsers();
  const idx = users.findIndex(u => u.uid === user.uid);
  const next =
    idx >= 0
      ? users.map((u, i) => (i === idx ? { ...u, ...user } : u))
      : [...users, { ...user, createdAt: user.createdAt || new Date().toISOString() }];
  return saveCustomUsers(next);
}

export function deleteCustomUser(uid: string): CustomFactoryUser[] {
  const users = loadCustomUsers();
  if (users.length <= 1) return users;
  const next = users.filter(u => u.uid !== uid);
  const saved = saveCustomUsers(next);
  const activeId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) : null;
  if (activeId === uid && saved.length > 0) {
    setActiveFactoryUser(saved[0].uid);
  }
  return saved;
}
