import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types';
/** Read the optional catalog fields permissively, including hosts with no child roster. */
export declare function worktreeAgentChildRows(agent: RuntimeWorktreeAgentRow, live: boolean): import("../../../src/shared/agent-status/presentation/agent-child-row-model").AgentChildRowModel[];
