import { useEffect, useState } from 'react';
import type { OmpEvent } from './agentChatEvents';
import type { TurnBlock } from './agentChatTypes';
import { useAgentI18n } from './useAgentI18n';
import Icon from '../Common/Icon';

export function useAgentActivity(projectId: string, sessionId: string, busy: boolean, blocks: TurnBlock[], retrying: boolean, compacting: boolean, event: OmpEvent | null) {
  const [terminal, setTerminal] = useState('');
  const [waiting, setWaiting] = useState<string[]>([]);
  useEffect(() => { if (busy) setTerminal(''); else setWaiting([]); }, [busy]);
  useEffect(() => { setTerminal(''); setWaiting([]); }, [projectId, sessionId]);
  useEffect(() => {
    if (!event) return;
    if (event.type === 'extension_ui_request') {
      if (['select', 'confirm', 'input', 'editor'].includes(String(event.method))) setWaiting(ids => [...new Set([...ids, String(event.id)])]);
      if (event.method === 'cancel') setWaiting(ids => ids.filter(id => id !== event.targetId));
    }
    if (event.type === 'extension_ui_responded') setWaiting(ids => ids.filter(id => id !== event.id));
    if (['agent_end', 'rpc_exit', 'rpc_error', 'rpc_restarting', 'agent_start'].includes(String(event.type))) {
      setWaiting([]);
      setTerminal(event.type === 'agent_end' ? 'Completed' : event.type === 'agent_start' ? '' : 'Agent unavailable');
    }
  }, [event]);
  if (!busy) return terminal || (blocks.length ? 'Stopped' : '');
  if (waiting.length) return 'Waiting for your answer';
  if (retrying) return 'Retrying connection';
  if (compacting) return 'Compacting context';
  const running = [...blocks].reverse().find(block => block.tool?.state === 'running');
  if (running) {
    const name = running.tool?.name || '';
    if (/bash|shell|terminal|exec/i.test(name)) return 'Running command';
    if (/edit|write|patch/i.test(name)) return 'Editing files';
    if (/read|glob|grep|search/i.test(name)) return 'Reading files';
    return 'Running tool';
  }
  const last = [...blocks].reverse().find(block => block.kind !== 'user');
  return last?.kind === 'thinking' ? 'Thinking' : last?.kind === 'text' ? 'Writing response' : 'Preparing response';
}

export default function AgentActivity({ activity, busy }: { activity: string; busy: boolean }) {
  const t = useAgentI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  if (!activity) return null;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return <div className="flex items-center gap-2 min-h-5 mb-1.5 text-[11px] text-ink-soft">
    <Icon name={busy ? 'spinner' : activity === 'Completed' ? 'check' : 'stop'} size={12} className={busy ? 'animate-spin' : activity === 'Completed' ? 'text-success' : 'text-ink-faint'} />
    <span role="status" aria-label={t('Agent activity')} aria-live="polite" aria-atomic="true"><span key={activity} className="agent-status-in inline-block">{t(activity)}</span></span>
    {busy && <span className="tabular-nums text-ink-faint" aria-hidden="true">· {clock}</span>}
  </div>;
}
