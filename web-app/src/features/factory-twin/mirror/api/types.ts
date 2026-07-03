// Wire types for talking to the backend gateway. The frontend NEVER calls an LLM
// directly — it sends chat + a world snapshot and gets back tool calls to execute.
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface WorldEntity {
  id: string;
  name: string;
  aliases?: string[];
  type: string;
  status: string;
  subsystemId?: string;
  model?: string;
  oee?: number;
  temperature?: number;
  todayCount?: number;
  alarms?: number;
}

export type AuthMode = 'mock' | 'openai_oauth';

export interface AuthStatus {
  mode: AuthMode;
  provider: 'mock' | 'openai';
  authenticated: boolean;
  user: { name?: string; email?: string } | null;
}
