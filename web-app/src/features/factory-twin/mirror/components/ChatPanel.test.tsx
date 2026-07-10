import '@testing-library/jest-dom/vitest';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../../test/utils';
import { TWIN_AGENT_SESSION_ID } from '../hooks/useTwinAgentBridge';
import { useFactoryStore } from '../store/factoryStore';
import { ChatPanel } from './ChatPanel';

const apiMock = vi.hoisted(() => ({
  postTwinAgentMessage: vi.fn(),
}));

vi.mock('../../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/api')>('../../../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      postTwinAgentMessage: apiMock.postTwinAgentMessage,
    },
  };
});

const runConversationMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../agent/runConversation', () => ({ runConversation: runConversationMock }));

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
});

function typeAndSend(text: string) {
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

it('sends through the cloud agent when online and stays busy until the reply lands', async () => {
  apiMock.postTwinAgentMessage.mockResolvedValue({ jobId: 'job-1' });
  useFactoryStore.getState().setCloudAgentOnline(true);

  renderWithProviders(<ChatPanel />);
  typeAndSend('派 AMR 去出貨區');

  const messages = useFactoryStore.getState().messages;
  expect(messages.some((m) => m.role === 'user' && m.text === '派 AMR 去出貨區')).toBe(true);
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(1);
  expect(screen.getByText('思考中…')).toBeInTheDocument();

  await waitFor(() => {
    expect(apiMock.postTwinAgentMessage).toHaveBeenCalledWith('test-token', {
      sessionId: TWIN_AGENT_SESSION_ID,
      text: '派 AMR 去出貨區',
    });
  });
  expect(runConversationMock).not.toHaveBeenCalled();

  act(() => {
    useFactoryStore.getState().decPendingAgentReplies();
  });
  expect(screen.queryByText('思考中…')).not.toBeInTheDocument();

  expect(screen.getByText('AI 代理在線')).toBeInTheDocument();
  expect(screen.getByText('Send an AMR to the dock')).toBeInTheDocument();
  expect(screen.getByText('讓 HC600-02 出貨口跑一趟')).toBeInTheDocument();
});

it('releases the pending reply when the send fails after the panel unmounts', async () => {
  let rejectSend!: (error: Error) => void;
  apiMock.postTwinAgentMessage.mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectSend = reject;
      }),
  );
  useFactoryStore.getState().setCloudAgentOnline(true);

  const view = renderWithProviders(<ChatPanel />);
  typeAndSend('派 AMR 去出貨區');

  await waitFor(() => {
    expect(apiMock.postTwinAgentMessage).toHaveBeenCalled();
  });
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(1);

  view.unmount();
  rejectSend(new Error('network down'));

  await waitFor(() => {
    expect(useFactoryStore.getState().pendingAgentReplies).toBe(0);
  });
});

it('falls back to the local rule engine when the cloud agent is offline', async () => {
  renderWithProviders(<ChatPanel />);

  expect(screen.getByText('本機規則模式')).toBeInTheDocument();
  typeAndSend('HC600-03 今天狀況？');

  await waitFor(() => {
    expect(runConversationMock).toHaveBeenCalledWith('HC600-03 今天狀況？');
  });
  expect(apiMock.postTwinAgentMessage).not.toHaveBeenCalled();
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(0);
});

it('never uses simulated local replies for a live-only customer factory', () => {
  renderWithProviders(<ChatPanel liveOnly />);

  typeAndSend('01機台現在狀況');

  expect(runConversationMock).not.toHaveBeenCalled();
  expect(screen.getByText('4WALL AI 助理暫時離線，請稍後再試。')).toBeInTheDocument();
  expect(screen.getByText('今天計畫與實際對帳')).toBeInTheDocument();
  expect(screen.queryByText('Send an AMR to the dock')).not.toBeInTheDocument();
});

it('uses the isolated demo session and simulation-only suggestions', async () => {
  apiMock.postTwinAgentMessage.mockResolvedValue({ jobId: 'demo-job-1' });
  useFactoryStore.getState().setCloudAgentOnline(true);

  renderWithProviders(<ChatPanel demoPresentation demoScenarioId="plan_gap" sessionId="demo-session-1" />);

  expect(screen.getByText('4WALL AI 展示助手')).toBeInTheDocument();
  expect(screen.getByText('目前模擬 AMR 情況')).toBeInTheDocument();
  expect(screen.getByText('今天模擬計畫與實際差多少')).toBeInTheDocument();
  expect(screen.queryByText('Send an AMR to the dock')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('請輸入想了解的模擬情境…')).toBeInTheDocument();

  typeAndSend('目前模擬 AMR 情況');

  await waitFor(() => {
    expect(apiMock.postTwinAgentMessage).toHaveBeenCalledWith('test-token', {
      sessionId: 'demo-session-1',
      text: '目前模擬 AMR 情況',
    });
  });
});

it('forces a simulation label when the demo falls back to local rules', async () => {
  renderWithProviders(<ChatPanel demoPresentation demoScenarioId="plan_gap" sessionId="demo-session-1" />);

  typeAndSend('HC600-03 今天狀況？');

  await waitFor(() => {
    expect(runConversationMock).toHaveBeenCalledWith('HC600-03 今天狀況？', {
      labelSimulation: true,
      demoScenarioId: 'plan_gap',
    });
  });
});
