// Central app state (Zustand). Both the React UI and the R3F 3D scene subscribe here,
// so a single store drives chat, panels, highlights, links and camera focus together.
import { create } from 'zustand';
import type { CameraEntity, Entity, PersonEntity } from '../domain/entities';

export interface Highlight {
  color: string;
}

export interface LinkLine {
  id: string;
  from: string; // entity id
  to: string; // entity id
  label?: string;
  color: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

export interface CameraTarget {
  id: string;
  nonce: number; // bump to re-trigger a fly-to even for the same id
}

export type SimSpeed = 1 | 2 | 4;

export interface SimEvent {
  id: string;
  atMs: number;
  type: 'machine' | 'dispatch' | 'repair' | 'amr' | 'drone' | 'control';
  message: string;
  entityId?: string;
  important?: boolean;
}

export interface ReasoningEvidence {
  id: string;
  source: string;
  nodeId?: string;
  label: string;
  detail: string;
}

export interface RootCauseCandidate {
  id: string;
  title: string;
  confidence: number;
  why: string;
  evidenceIds: string[];
}

export interface ReasoningStep {
  id: string;
  title: string;
  detail: string;
}

export interface ActionPlanStep {
  id: string;
  title: string;
  risk: 'notification' | 'dispatch' | 'machine_command';
  autonomy: 'auto' | 'suggest' | 'blocked';
  status: 'planned' | 'sent' | 'blocked';
}

export interface ReasoningTrace {
  id: string;
  signalId: string;
  rootCause: string;
  confidence: number;
  evidence: ReasoningEvidence[];
  candidates: RootCauseCandidate[];
  steps: ReasoningStep[];
  plan: ActionPlanStep[];
  createdAtMs: number;
  usedLlm: boolean;
}

export interface AgentNotification {
  id: string;
  auditId: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  entityId?: string;
  reasoningId?: string;
  trace?: ReasoningTrace;
  createdAtMs: number;
  lineMode: 'mock' | 'live';
}

export interface FactoryState {
  entities: Record<string, Entity>;
  selectedId: string | null;
  highlights: Record<string, Highlight>;
  links: LinkLine[];
  cameraTarget: CameraTarget | null;
  messages: ChatMessage[];

  // P3 simulation controls + event stream
  simPaused: boolean;
  simSpeed: SimSpeed;
  simTimeMs: number;
  simEvents: SimEvent[];
  manualAlarmTargetId: string | null;
  manualAlarmNonce: number;
  agentConnected: boolean;
  agentNotifications: AgentNotification[];
  cloudAgentOnline: boolean;
  pendingAgentReplies: number;
  platformCameras: CameraEntity[];
  livePersons: PersonEntity[];

  // GLB binding info (for debug panel + marker/sim awareness)
  glbLoadState: 'loading' | 'ready' | 'failed';
  glbMeshNames: string[];
  boundEntityIds: string[];
  boundMap: Record<string, string>;
  debugOpen: boolean;

  // UI layout (collapsible panels so the 3D view can be the dominant area)
  leftOpen: boolean;
  rightOpen: boolean;
  // Dev coordinate probe: last clicked floor point (world x/z)
  probedCoord: { x: number; z: number } | null;

  setEntities: (e: Record<string, Entity>) => void;
  patchEntity: (id: string, patch: Record<string, unknown>) => void;
  select: (id: string | null) => void;
  setHighlight: (id: string, h: Highlight | null) => void;
  clearHighlights: () => void;
  addLink: (link: LinkLine) => void;
  removeLink: (id: string) => void;
  clearLinks: () => void;
  focus: (id: string) => void;
  addMessage: (m: ChatMessage) => void;
  setSimPaused: (paused: boolean) => void;
  setSimSpeed: (speed: SimSpeed) => void;
  advanceSimTime: (deltaMs: number) => void;
  pushSimEvent: (event: Omit<SimEvent, 'id'> & { id?: string }) => void;
  triggerMachineAlarm: (targetId?: string | null) => void;
  clearManualAlarm: () => void;
  setAgentConnected: (connected: boolean) => void;
  addAgentNotification: (notification: AgentNotification) => void;
  dismissAgentNotification: (id: string) => void;
  setCloudAgentOnline: (online: boolean) => void;
  incPendingAgentReplies: () => void;
  decPendingAgentReplies: () => void;
  setPlatformCameras: (cameras: CameraEntity[]) => void;
  setLivePersons: (people: PersonEntity[]) => void;
  clearOverlays: () => void;
  setGlbLoadState: (state: FactoryState['glbLoadState']) => void;
  setGlbInfo: (meshNames: string[], boundIds: string[], boundMap: Record<string, string>) => void;
  toggleDebug: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setProbedCoord: (c: { x: number; z: number } | null) => void;
}

export const useFactoryStore = create<FactoryState>((set) => ({
  entities: {},
  selectedId: null,
  highlights: {},
  links: [],
  cameraTarget: null,
  messages: [],
  simPaused: false,
  simSpeed: 1,
  simTimeMs: 0,
  simEvents: [],
  manualAlarmTargetId: null,
  manualAlarmNonce: 0,
  agentConnected: false,
  agentNotifications: [],
  cloudAgentOnline: false,
  pendingAgentReplies: 0,
  platformCameras: [],
  livePersons: [],
  glbLoadState: 'loading',
  glbMeshNames: [],
  boundEntityIds: [],
  boundMap: {},
  debugOpen: false,
  leftOpen: true,
  rightOpen: true,
  probedCoord: null,

  setEntities: (e) => set({ entities: e }),
  patchEntity: (id, patch) =>
    set((s) => {
      const cur = s.entities[id];
      if (!cur) return {};
      return { entities: { ...s.entities, [id]: { ...cur, ...patch } as Entity } };
    }),
  select: (id) =>
    set((s) => ({
      selectedId: id,
      rightOpen: id ? true : s.rightOpen,
    })),
  setHighlight: (id, h) =>
    set((s) => {
      const next = { ...s.highlights };
      if (h) next[id] = h;
      else delete next[id];
      return { highlights: next };
    }),
  clearHighlights: () => set({ highlights: {} }),
  addLink: (link) =>
    set((s) => ({ links: [...s.links.filter((l) => l.id !== link.id), link] })),
  removeLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),
  clearLinks: () => set({ links: [] }),
  focus: (id) =>
    set((s) => ({ cameraTarget: { id, nonce: (s.cameraTarget?.nonce ?? 0) + 1 } })),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setSimPaused: (paused) => set({ simPaused: paused }),
  setSimSpeed: (speed) => set({ simSpeed: speed }),
  advanceSimTime: (deltaMs) => set((s) => ({ simTimeMs: s.simTimeMs + deltaMs })),
  pushSimEvent: (event) =>
    set((s) => {
      const full: SimEvent = {
        ...event,
        id: event.id ?? uid('sim-event'),
      };
      const shouldMirrorToChat =
        event.important !== false &&
        !s.simEvents.some(
          (existing) => existing.important !== false && event.atMs - existing.atMs < 10000,
        );
      const messages = shouldMirrorToChat
        ? [...s.messages, { id: uid('msg'), role: 'system' as const, text: full.message }]
        : s.messages;
      return {
        simEvents: [full, ...s.simEvents].slice(0, 40),
        messages,
      };
    }),
  triggerMachineAlarm: (targetId = null) =>
    set((s) => ({ manualAlarmTargetId: targetId, manualAlarmNonce: s.manualAlarmNonce + 1 })),
  clearManualAlarm: () => set({ manualAlarmTargetId: null }),
  setAgentConnected: (connected) => set({ agentConnected: connected }),
  addAgentNotification: (notification) =>
    set((s) => ({
      agentNotifications: [
        notification,
        ...s.agentNotifications.filter((item) => item.id !== notification.id),
      ].slice(0, 20),
    })),
  dismissAgentNotification: (id) =>
    set((s) => ({ agentNotifications: s.agentNotifications.filter((item) => item.id !== id) })),
  setCloudAgentOnline: (online) => set({ cloudAgentOnline: online }),
  incPendingAgentReplies: () => set((s) => ({ pendingAgentReplies: s.pendingAgentReplies + 1 })),
  decPendingAgentReplies: () =>
    set((s) => ({ pendingAgentReplies: Math.max(0, s.pendingAgentReplies - 1) })),
  setPlatformCameras: (cameras) => set({ platformCameras: cameras }),
  setLivePersons: (people) =>
    set((s) => {
      const nextEntities = { ...s.entities };
      const liveIds = new Set(people.map((person) => person.id));
      for (const [id, entity] of Object.entries(nextEntities)) {
        if (entity.type === 'person' && entity.source === 'live') {
          delete nextEntities[id];
        }
      }
      for (const person of people) {
        nextEntities[person.id] = person;
      }
      const selected = s.selectedId ? s.entities[s.selectedId] : null;
      return {
        entities: nextEntities,
        livePersons: people,
        selectedId:
          selected?.type === 'person' && selected.source === 'live' && !liveIds.has(selected.id)
            ? null
            : s.selectedId,
      };
    }),
  clearOverlays: () => set({ highlights: {}, links: [], selectedId: null }),
  setGlbLoadState: (state) => set({ glbLoadState: state }),
  setGlbInfo: (meshNames, boundIds, boundMap) =>
    set({ glbMeshNames: meshNames, boundEntityIds: boundIds, boundMap }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setProbedCoord: (c) => set({ probedCoord: c }),
}));

export function uid(prefix = 'id'): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
