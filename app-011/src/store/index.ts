import { create } from 'zustand';
import type { ChangeOrder, ConfirmSheet, Plan, Room, Opening, Outlet, MatSpec } from '../types';
import { DEFAULT_MATS } from '../utils/materialCalc';
import { applyChangeOrders, buildSheetPoints, isSheetComplete } from '../utils/signoff';

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
  /** 出具确认单：首版基于当前点位；后续版本须等上一版确认完且有积攒的变更 */
  createSheet: (planId: string) => { ok: boolean; message: string };
  /** 在签署中的确认单上签名（师傅/业主），签过不可改 */
  signPoint: (
    planId: string,
    sheetId: string,
    outletId: string,
    role: 'master' | 'owner',
    name: string
  ) => void;
  /** 登记变更单：只有最新一版已确认后才能提变更 */
  addChangeOrder: (planId: string, order: Omit<ChangeOrder, 'id' | 'createdAt'>) => { ok: boolean; message: string };
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useStore = create<AppState>((set, get) => ({
  plans: [],
  currentPlanId: null,
  scale: 1,

  setScale: (s) => set({ scale: s }),

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
      sheets: [],
      changeOrders: [],
    };
    set((state) => ({ plans: [...state.plans, plan], currentPlanId: id }));
    return id;
  },

  deletePlan: (id) =>
    set((state) => ({
      plans: state.plans.filter((p) => p.id !== id),
      currentPlanId: state.currentPlanId === id ? null : state.currentPlanId,
    })),

  getPlan: (id) => get().plans.find((p) => p.id === id),

  updatePlan: (id, updater) =>
    set((state) => ({
      plans: state.plans.map((p) => (p.id === id ? updater(p) : p)),
    })),

  addRoom: (planId, room) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, rooms: [...p.rooms, room] } : p
      ),
    })),

  updateRoom: (planId, roomId, updater) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId
          ? { ...p, rooms: p.rooms.map((r) => (r.id === roomId ? updater(r) : r)) }
          : p
      ),
    })),

  deleteRoom: (planId, roomId) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId
          ? {
              ...p,
              rooms: p.rooms.filter((r) => r.id !== roomId),
              openings: p.openings.filter((o) => o.roomId !== roomId),
            }
          : p
      ),
    })),

  addOpening: (planId, opening) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, openings: [...p.openings, opening] } : p
      ),
    })),

  deleteOpening: (planId, openingId) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId
          ? { ...p, openings: p.openings.filter((o) => o.id !== openingId) }
          : p
      ),
    })),

  addOutlet: (planId, outlet) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, outlets: [...p.outlets, outlet] } : p
      ),
    })),

  deleteOutlet: (planId, outletId) =>
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId
          ? { ...p, outlets: p.outlets.filter((o) => o.id !== outletId) }
          : p
      ),
    })),

  updateMaterials: (planId, mats) =>
    set((state) => ({
      plans: state.plans.map((p) => (p.id === planId ? { ...p, materials: mats } : p)),
    })),

  createSheet: (planId) => {
    let result = { ok: false, message: '方案不存在' };
    set((state) => ({
      plans: state.plans.map((p) => {
        if (p.id !== planId) return p;
        const sheets = p.sheets ?? [];
        const orders = p.changeOrders ?? [];
        const latest = sheets[sheets.length - 1];

        if (latest && latest.status !== 'confirmed') {
          result = { ok: false, message: `第${latest.version}版还没确认完，签完所有点位才能出新版` };
          return p;
        }
        const pending = orders.filter((o) => o.appliedInVersion == null);
        if (latest && pending.length === 0) {
          result = { ok: false, message: '没有待生效的变更，无需出新版' };
          return p;
        }
        const outlets = applyChangeOrders(p.outlets, pending);
        if (outlets.length === 0) {
          result = { ok: false, message: '没有点位，请先在「墙面点位」添加' };
          return p;
        }
        const version = sheets.length + 1;
        const sheet: ConfirmSheet = {
          id: genId(),
          version,
          createdAt: Date.now(),
          points: buildSheetPoints(p, outlets),
          changeOrderIds: pending.map((o) => o.id),
          status: 'signing',
        };
        result = { ok: true, message: `已出具第${version}版确认单，共${sheet.points.length}个点位待双方签字` };
        return {
          ...p,
          outlets,
          sheets: [...sheets, sheet],
          changeOrders: orders.map((o) =>
            o.appliedInVersion == null ? { ...o, appliedInVersion: version } : o
          ),
        };
      }),
    }));
    return result;
  },

  signPoint: (planId, sheetId, outletId, role, name) =>
    set((state) => ({
      plans: state.plans.map((p) => {
        if (p.id !== planId) return p;
        const sheets = (p.sheets ?? []).map((s) => {
          if (s.id !== sheetId || s.status !== 'signing') return s;
          const points = s.points.map((pt) => {
            if (pt.outletId !== outletId) return pt;
            // 已签过的不许覆盖，只能保持原样
            if (role === 'master' && !pt.masterSign)
              return { ...pt, masterSign: { name, signedAt: Date.now() } };
            if (role === 'owner' && !pt.ownerSign)
              return { ...pt, ownerSign: { name, signedAt: Date.now() } };
            return pt;
          });
          const next = { ...s, points };
          if (isSheetComplete(next)) {
            return { ...next, status: 'confirmed' as const, confirmedAt: Date.now() };
          }
          return next;
        });
        return { ...p, sheets };
      }),
    })),

  addChangeOrder: (planId, order) => {
    let result = { ok: false, message: '方案不存在' };
    set((state) => ({
      plans: state.plans.map((p) => {
        if (p.id !== planId) return p;
        const sheets = p.sheets ?? [];
        const latest = sheets[sheets.length - 1];
        if (!latest) {
          result = { ok: false, message: '还没有确认单，请先生成首版并签字确认' };
          return p;
        }
        if (latest.status !== 'confirmed') {
          result = { ok: false, message: '当前确认单还没签完，确认完之后才能提变更' };
          return p;
        }
        const full: ChangeOrder = { ...order, id: genId(), createdAt: Date.now() };
        result = { ok: true, message: '变更已登记，攒够后可出具新版确认单' };
        return { ...p, changeOrders: [...(p.changeOrders ?? []), full] };
      }),
    }));
    return result;
  },
}));
