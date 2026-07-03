// Executes a tool call (decided by the backend LLM) against the frontend action layer,
// which mutates the 3D scene store. Tool *specs* now live on the backend; the browser
// only EXECUTES the calls it receives.
import { ACTIONS, type ActionResult } from '../actions/actions';
import type { ToolCall } from '../api/types';

export function executeToolCall(call: ToolCall): ActionResult {
  const fn = (ACTIONS as unknown as Record<string, (args: Record<string, unknown>) => ActionResult>)[call.name];
  if (!fn) return { ok: false, message: `未知工具 ${call.name}` };
  return fn(call.arguments ?? {});
}
