import { useState, useEffect, useRef, useCallback } from 'react';
import * as fs from 'fs';
import type { Services } from '../../types/service.types.js';
import type { IndexStats } from '../../types/index.types.js';
import type { LoadedWorkflowConfig, LogEntry, WorkflowRunStats } from '../types/workflow.types.js';
import { processEmail, runWorkflowManually } from '../services/workflow-runner.js';
import { handleRefreshIndex } from '../../tools/index-tools.js';

interface InternalState {
  stats: IndexStats | null;
  log: LogEntry[];
  isRefreshing: boolean;
  workflowStats: Map<string, WorkflowRunStats>;
}

export interface WatcherState extends InternalState {
  runManual: (workflow: LoadedWorkflowConfig, customPreamble: string) => Promise<void>;
}

const MAX_LOG_ENTRIES = 100;
const DEBOUNCE_MS = 500;

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function appendLog(prev: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry];
}

export function useIndexWatcher(
  services: Services,
  workflows: LoadedWorkflowConfig[],
  promptsDirectory: string,
): WatcherState {
  const [state, setState] = useState<InternalState>({
    stats: null,
    log: [],
    isRefreshing: false,
    workflowStats: new Map(),
  });

  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;

  const promptsDirRef = useRef(promptsDirectory);
  promptsDirRef.current = promptsDirectory;

  const runManual = useCallback(async (workflow: LoadedWorkflowConfig, customPreamble: string) => {
    try {
      await runWorkflowManually(workflow, customPreamble, promptsDirRef.current);
      const nowIso = new Date().toISOString();
      const nowDisplay = timestamp();
      setState(prev => {
        const newStats = new Map(prev.workflowStats);
        const existing = newStats.get(workflow.name) ?? { lastRunAt: null, runCount: 0 };
        newStats.set(workflow.name, {
          lastRunAt: nowIso,
          runCount: existing.runCount + 1,
        });
        return {
          ...prev,
          workflowStats: newStats,
          log: appendLog(prev.log, {
            time: nowDisplay,
            message: `Workflow started (manual): ${workflow.name}`,
            kind: 'workflow',
          }),
        };
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        log: appendLog(prev.log, {
          time: timestamp(),
          message: `Error running workflow manually: ${err instanceof Error ? err.message : String(err)}`,
          kind: 'error',
        }),
      }));
    }
  }, []);

  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const run = async () => {
      const wasFirstRun = isFirstRun.current;
      setState(prev => ({ ...prev, isRefreshing: true }));

      try {
        if (wasFirstRun) {
          const preExisting = services.index.getAll();
          for (const entry of preExisting) {
            if (!services.index.isProcessed(entry.messageId)) services.index.markProcessed(entry.messageId);
          }
          isFirstRun.current = false;
        }

        const result = await handleRefreshIndex(services);
        const refreshResult = result.structuredContent as unknown as { added: number; removed: number; updated: number };
        const stats = services.index.getStats();

        setState(prev => {
          let log = prev.log;
          if (refreshResult.added > 0 || refreshResult.removed > 0 || refreshResult.updated > 0) {
            log = appendLog(log, {
              time: timestamp(),
              message: `Index: +${refreshResult.added} added, -${refreshResult.removed} removed, ~${refreshResult.updated} updated`,
              kind: 'refresh',
            });
          }
          return { ...prev, stats, isRefreshing: false, log };
        });

        const allIndexed = services.index.getAll();
        const unprocessed = allIndexed.filter(entry => !services.index.isProcessed(entry.messageId));

        for (const entry of unprocessed) {
          try {
            const processed = await processEmail(
              entry.filePath,
              workflowsRef.current,
              services.parser,
              services.index,
              promptsDirectory,
            );

            if (processed === null) continue;

            setState(prev => ({
              ...prev,
              log: appendLog(prev.log, {
                time: timestamp(),
                message: `"${processed.subject || processed.filePath}"`,
                kind: 'found',
              }),
            }));

            for (const match of processed.matches) {
              const nowIso = new Date().toISOString();
              const nowDisplay = timestamp();
              setState(prev => {
                const newStats = new Map(prev.workflowStats);
                const existing = newStats.get(match.workflowName) ?? { lastRunAt: null, runCount: 0 };
                newStats.set(match.workflowName, {
                  lastRunAt: nowIso,
                  runCount: existing.runCount + 1,
                });
                return {
                  ...prev,
                  workflowStats: newStats,
                  log: appendLog(prev.log, {
                    time: nowDisplay,
                    message: `Workflow started: ${match.workflowName}`,
                    kind: 'workflow',
                  }),
                };
              });
            }
          } catch (emailError) {
            setState(prev => ({
              ...prev,
              log: appendLog(prev.log, {
                time: timestamp(),
                message: `Error processing email: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
                kind: 'error',
              }),
            }));
          }
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          log: appendLog(prev.log, {
            time: timestamp(),
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            kind: 'error',
          }),
        }));
      }
    };

    const scheduleRun = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(run, DEBOUNCE_MS);
    };

    const { inboxDirectory, outboxDirectory, draftsDirectory } = services.config;
    const watchers: fs.FSWatcher[] = [];
    let mounted = true;

    run().finally(() => {
      if (!mounted) return;
      for (const dir of [inboxDirectory, outboxDirectory, draftsDirectory]) {
        try {
          watchers.push(fs.watch(dir, scheduleRun));
        } catch {
          // Directory may not exist yet
        }
      }
    });

    return () => {
      mounted = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      for (const watcher of watchers) watcher.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, runManual };
}
