import { create } from 'zustand';
import type { Plan, Room, Opening, Outlet, MatSpec, SignRole, WalkthroughSheet } from '../types';
import { DEFAULT_MATS } from '../utils/materialCalc';
import {
  createSheet,
  newChangeId,
  newOutletId,
  publishVersion,
  type ChangeDraft,
} from '../utils/walkthrough';

const STORAGE_KEY = 'home-renovation-planner-v1';

export interface AddChangeInput {
  kind: ChangeDraft['kind'];
  /** modify/remove 时为目标点位 id；add 时可空（自动生成） */
  outletId?: string;
  reason: string;
  before?: ChangeDraft['before'];
  after?: ChangeDraft['after'];
  wallKey?: string;
  label: string;
  raisedBy: SignRole;
  raisedByName: string;
}

interface AppState {
  plans: Plan[];
  currentPlanId: string | null;
  scale: number;
  setScale: (s: number) => void;
  addPlan: (name: string) => string;
  deletePlan: (id: string) => void;
  getPlan: (id: string) => Plan | undefined;
  updatePlan: (id: string, updater: (plan: Plan) => Plan) => void;
  addRoom: (planId: string, room: Room) => void;
  updateRoom: (planId: string, roomId: string, updater: (room: Room) => Room) => void;
  deleteRoom: (planId: string, roomId: string) => void;
  addOpening: (planId: string, opening: Opening) => void;
  deleteOpening: (planId: string, openingId: string) => void;
  addOutlet: (planId: string, outlet: Outlet) => void;
  deleteOutlet: (planId: string, outletId: string) => void;
  updateMaterials: (planId: string, mats: MatSpec[]) => void;
  /** 交底确认单相关 */
  createWalkthrough: (planId: string, params: { name: string; role: SignRole; note: string }) => void;
  signPoint: (planId: string, outletId: string, role: SignRole, name: string) => void;
  unsignPoint: (planId: string, outletId: string, role: SignRole) => void;
  addChange: (planId: string, input: AddChangeInput) => string | null;
  cancelChange: (planId: string, changeId: string) => void;
  publishNewVersion: (
    planId: string,
    params: { name: string; role: SignRole; note: string }
  ) => void;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ---------- localStorage 持久化 ---------- */

function loadState(): Pick<AppState, 'plans' | 'currentPlanId' | 'scale'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        plans: Array.isArray(parsed.plans) ? parsed.plans : [],
        currentPlanId: parsed.currentPlanId ?? null,
        scale: typeof parsed.scale === 'number' ? parsed.scale : 1,
      };
    }
  } catch {
    // 数据损坏时回退到空状态
  }
  return { plans: [], currentPlanId: null, scale: 1 };
}

function persist(state: Pick<AppState, 'plans' | 'currentPlanId' | 'scale'>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        plans: state.plans,
        currentPlanId: state.currentPlanId,
        scale: state.scale,
      })
    );
  } catch {
    // 存储满或被禁用时静默失败，不影响本次操作
  }
}

/** 该点位当前版本是否已被任一方签字——签过即锁定，禁止原地改 */
function isOutletLocked(plan: Plan, outletId: string): boolean {
  const row = plan.sheet?.rows.find((r) => r.outletId === outletId);
  if (!row) return false;
  return Boolean(row.confirmation.worker || row.confirmation.owner);
}

function updateSheet(plan: Plan, updater: (sheet: WalkthroughSheet) => WalkthroughSheet): Plan {
  if (!plan.sheet) return plan;
  return { ...plan, sheet: updater(plan.sheet) };
}

const initial = loadState();

export const useStore = create<AppState>((set, get) => {
  const commit = (partial: Partial<AppState>) => {
    set(partial);
    const s = get();
    persist({ plans: s.plans, currentPlanId: s.currentPlanId, scale: s.scale });
  };

  const mutatePlan = (planId: string, updater: (plan: Plan) => Plan) =>
    commit({
      plans: get().plans.map((p) => (p.id === planId ? updater(p) : p)),
    });

  return {
    plans: initial.plans,
    currentPlanId: initial.currentPlanId,
    scale: initial.scale,

    setScale: (s) => commit({ scale: s }),

    addPlan: (name) => {
      const id = genId();
      const plan: Plan = {
        id,
        name,
        createdAt: Date.now(),
        rooms: [],
        openings: [],
        outlets: [],
        materials: [...DEFAULT_MATS],
      };
      commit({ plans: [...get().plans, plan], currentPlanId: id });
      return id;
    },

    deletePlan: (id) =>
      commit({
        plans: get().plans.filter((p) => p.id !== id),
        currentPlanId: get().currentPlanId === id ? null : get().currentPlanId,
      }),

    getPlan: (id) => get().plans.find((p) => p.id === id),

    updatePlan: (id, updater) => mutatePlan(id, updater),

    addRoom: (planId, room) =>
      mutatePlan(planId, (p) => ({ ...p, rooms: [...p.rooms, room] })),

    updateRoom: (planId, roomId, updater) =>
      mutatePlan(planId, (p) => ({
        ...p,
        rooms: p.rooms.map((r) => (r.id === roomId ? updater(r) : r)),
      })),

    deleteRoom: (planId, roomId) =>
      mutatePlan(planId, (p) => ({
        ...p,
        rooms: p.rooms.filter((r) => r.id !== roomId),
        openings: p.openings.filter((o) => o.roomId !== roomId),
      })),

    addOpening: (planId, opening) =>
      mutatePlan(planId, (p) => ({ ...p, openings: [...p.openings, opening] })),

    deleteOpening: (planId, openingId) =>
      mutatePlan(planId, (p) => ({
        ...p,
        openings: p.openings.filter((o) => o.id !== openingId),
      })),

    addOutlet: (planId, outlet) => {
      const plan = get().getPlan(planId);
      // 已建档后新增点位必须走变更单，保证确认单可追溯
      if (plan?.sheet) {
        console.warn('确认单已建档：新增点位请走「变更单」流程');
        return;
      }
      mutatePlan(planId, (p) => ({ ...p, outlets: [...p.outlets, outlet] }));
    },

    deleteOutlet: (planId, outletId) => {
      const plan = get().getPlan(planId);
      if (plan && isOutletLocked(plan, outletId)) {
        console.warn('该点位已签字确认，不能原地删除，请提变更单');
        return;
      }
      mutatePlan(planId, (p) => ({
        ...p,
        outlets: p.outlets.filter((o) => o.id !== outletId),
      }));
    },

    updateMaterials: (planId, mats) =>
      mutatePlan(planId, (p) => ({ ...p, materials: mats })),

    /* ---------------- 水电交底确认单 ---------------- */

    createWalkthrough: (planId, params) => {
      const plan = get().getPlan(planId);
      if (!plan || plan.sheet) return;
      const sheet = createSheet(plan, { ...params, at: Date.now() });
      mutatePlan(planId, (p) => ({ ...p, sheet }));
    },

    signPoint: (planId, outletId, role, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      mutatePlan(planId, (p) =>
        updateSheet(p, (sheet) => {
          const stampRow = (rows: typeof sheet.rows) =>
            rows.map((r) =>
              r.outletId === outletId
                ? { ...r, confirmation: { ...r.confirmation, [role]: { role, name: trimmed, time: Date.now() } } }
                : r
            );
          // 当前行与封存快照同步留痕；历史版本不动
          const rows = stampRow(sheet.rows);
          const currentSnapshot = sheet.versions.find((v) => v.version === sheet.currentVersion);
          let versions = sheet.versions;
          if (currentSnapshot) {
            versions = sheet.versions.map((v) =>
              v.version === sheet.currentVersion ? { ...v, rows: stampRow(v.rows) } : v
            );
          }
          return { ...sheet, rows, versions };
        })
      );
    },

    unsignPoint: (planId, outletId, role) =>
      mutatePlan(planId, (p) =>
        updateSheet(p, (sheet) => {
          const clearRow = (rows: typeof sheet.rows) =>
            rows.map((r) => {
              if (r.outletId !== outletId) return r;
              const confirmation = { ...r.confirmation };
              delete confirmation[role];
              return { ...r, confirmation };
            });
          const rows = clearRow(sheet.rows);
          const versions = sheet.versions.map((v) =>
            v.version === sheet.currentVersion ? { ...v, rows: clearRow(v.rows) } : v
          );
          return { ...sheet, rows, versions };
        })
      ),

    addChange: (planId, input) => {
      const plan = get().getPlan(planId);
      if (!plan?.sheet) return null;
      const reason = input.reason.trim();
      if (!reason) return null;
      if (!input.raisedByName.trim()) return null;

      let outletId = input.outletId || '';
      let wallKey = input.wallKey;
      let label = input.label.trim();
      let roomName = '';
      let wallName = '';

      if (input.kind === 'add') {
        outletId = newOutletId();
        wallKey = input.wallKey;
        label = label || '新点位';
        const parsed = wallKey
          ? (() => {
              const i = wallKey.lastIndexOf('-');
              return { roomId: wallKey.slice(0, i), wallIndex: parseInt(wallKey.slice(i + 1), 10) };
            })()
          : null;
        const room = parsed ? plan.rooms.find((r) => r.id === parsed.roomId) : undefined;
        roomName = room?.name || '';
        wallName = parsed ? `墙${parsed.wallIndex + 1}` : '';
      } else {
        const target = plan.outlets.find((o) => o.id === outletId);
        if (!target) return null;
        const row = plan.sheet!.rows.find((r) => r.outletId === outletId);
        // 已签字点位只能走变更；未签字的可直接调整，不必提变更
        if (input.kind === 'modify' && row && !row.confirmation.worker && !row.confirmation.owner) {
          return null;
        }
        // 同一点位已有待发布变更时，先处理（发布或取消）那条，避免互相覆盖
        const dup = plan.sheet!.changes.find(
          (c) => c.status === 'pending' && c.outletId === outletId
        );
        if (dup) return null;
        wallKey = target.wallKey;
        label = target.label || row?.label || '点位';
        roomName = row?.roomName || '';
        wallName = row?.wallName || '';
      }

      const change = {
        id: newChangeId(),
        kind: input.kind,
        outletId,
        label,
        roomName,
        wallName,
        reason,
        before: input.before,
        after: input.after,
        wallKey,
        raisedBy: input.raisedBy,
        raisedByName: input.raisedByName.trim(),
        raisedAt: Date.now(),
        status: 'pending' as const,
      };

      mutatePlan(planId, (p) =>
        updateSheet(p, (sheet) => ({ ...sheet, changes: [...sheet.changes, change] }))
      );
      return change.id;
    },

    cancelChange: (planId, changeId) =>
      mutatePlan(planId, (p) =>
        updateSheet(p, (sheet) => ({
          ...sheet,
          changes: sheet.changes.map((c) =>
            c.id === changeId && c.status === 'pending'
              ? { ...c, status: 'cancelled' as const }
              : c
          ),
        }))
      ),

    publishNewVersion: (planId, params) => {
      const plan = get().getPlan(planId);
      if (!plan?.sheet) return;
      const pending = plan.sheet.changes.filter((c) => c.status === 'pending');
      if (pending.length === 0) return;
      const { sheet, outlets } = publishVersion(plan.sheet, plan, {
        ...params,
        at: Date.now(),
      });
      mutatePlan(planId, (p) => ({ ...p, outlets, sheet }));
    },
  };
});
