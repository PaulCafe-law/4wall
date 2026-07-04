import { useFactoryStore } from '../store/factoryStore';

export function AuthControl() {
  const cloudAgentOnline = useFactoryStore((s) => s.cloudAgentOnline);
  return (
    <span className={`auth-chip ${cloudAgentOnline ? 'online' : 'offline'}`}>
      {cloudAgentOnline ? 'AI 代理在線' : '本機規則模式'}
    </span>
  );
}
