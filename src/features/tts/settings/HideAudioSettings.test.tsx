import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';
import { recordedNoticeAckStore, type RecordedNoticeAcknowledgment } from '../lib/ackStore';

import { publishActiveSourceLicense } from './activeSourceLicenseStore';
import { HideAudioSettings } from './HideAudioSettings';
import { refreshHideAudio, setHideAudio } from './hideAudioStore';

const { mockFeatureFlag } = vi.hoisted(() => ({ mockFeatureFlag: vi.fn(() => true) }));

vi.mock('@/features/flags', () => ({ useFeatureFlag: mockFeatureFlag }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? '')),
  }),
}));

const acknowledgments: RecordedNoticeAcknowledgment[] = [
  {
    acknowledgedAt: '2026-09-22T12:00:00.000Z',
    notice: {
      textBibleKey: 'text-1',
      textBibleName: 'First text',
      recordingKey: 'recording-1',
      recordingName: 'First recording',
      recordingProvider: 'aquifer',
      notice: 'First licence.',
    },
  },
  {
    acknowledgedAt: '2026-09-22T11:00:00.000Z',
    notice: {
      textBibleKey: 'text-2',
      textBibleName: 'Second text',
      recordingKey: 'recording-2',
      recordingName: 'Second recording',
      recordingProvider: 'dbl',
      notice: 'Second licence.',
    },
  },
];

beforeEach(() => {
  publishActiveSourceLicense(null);
  localStorage.clear();
  refreshHideAudio();
  setHideAudio(false);
  mockFeatureFlag.mockReset();
  mockFeatureFlag.mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('HideAudioSettings', () => {
  it('renders only while the source-audio feature is on', () => {
    mockFeatureFlag.mockReturnValue(false);
    const { rerender } = render(<HideAudioSettings />);
    expect(screen.queryByRole('switch', { name: 'Hide audio controls' })).not.toBeInTheDocument();

    mockFeatureFlag.mockReturnValue(true);
    rerender(<HideAudioSettings />);
    expect(screen.getByRole('switch', { name: 'Hide audio controls' })).toBeInTheDocument();
  });

  it('stores the switch state and keeps it checked', async () => {
    const user = userEvent.setup();
    render(<HideAudioSettings />);
    const toggle = screen.getByRole('switch', { name: 'Hide audio controls' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('advertises every registered shortcut and describes the focused switch', async () => {
    const user = userEvent.setup();
    render(<HideAudioSettings />);
    const toggle = screen.getByRole('switch', { name: 'Hide audio controls' });

    await user.hover(screen.getByTestId('hide-audio-card'));
    const description = await screen.findByRole('tooltip');
    expect(toggle).toHaveAttribute('aria-describedby', description.id);
    for (const shortcut of Object.values(TTS_KEYBOARD_SHORTCUTS)) {
      expect(description).toHaveTextContent(shortcut);
    }
  });

  it('opens the same shortcut description when keyboard focus reaches the switch', async () => {
    const user = userEvent.setup();
    render(<HideAudioSettings />);
    const toggle = screen.getByRole('switch', { name: 'Hide audio controls' });

    await user.tab();

    expect(toggle).toHaveFocus();
    const description = await screen.findByRole('tooltip');
    expect(toggle).toHaveAttribute('aria-describedby', description.id);
    for (const shortcut of Object.values(TTS_KEYBOARD_SHORTCUTS)) {
      expect(description).toHaveTextContent(shortcut);
    }
  });

  it('keeps the tooltip open while the pointer moves from the card into its content', async () => {
    const user = userEvent.setup();
    render(<HideAudioSettings />);
    const card = screen.getByTestId('hide-audio-card');

    await user.hover(card);
    await screen.findByRole('tooltip');
    const visibleContent = screen.getAllByText('Keyboard shortcuts')[0].parentElement!;
    await user.pointer({ target: visibleContent });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('opens the acknowledged-source list with its empty state', async () => {
    vi.spyOn(recordedNoticeAckStore, 'list').mockReturnValue([]);
    render(<HideAudioSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Audio sources & licences' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Audio sources & licences');
    expect(
      screen.getByText('No audio sources have been played on this device yet.')
    ).toBeInTheDocument();
  });

  it('restores the source-list launcher inside the Settings dialog after Escape', async () => {
    const user = userEvent.setup();
    vi.spyOn(recordedNoticeAckStore, 'list').mockReturnValue([]);
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <HideAudioSettings />
        </DialogContent>
      </Dialog>
    );
    const launcher = screen.getByRole('button', { name: 'Audio sources & licences' });
    await user.click(launcher);
    expect(screen.getByRole('dialog', { name: 'Audio sources & licences' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Audio sources & licences' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it('lists two acknowledged text and recording pairs', async () => {
    vi.spyOn(recordedNoticeAckStore, 'list').mockReturnValue(acknowledgments);
    render(<HideAudioSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Audio sources & licences' }));
    expect(screen.getByText('First text')).toBeInTheDocument();
    expect(screen.getByText('Aquifer: First recording')).toBeInTheDocument();
    expect(screen.getByText('Second text')).toBeInTheDocument();
    expect(screen.getByText('API.Bible: Second recording')).toBeInTheDocument();
  });

  it('follows a cross-tab preference refresh', () => {
    render(<HideAudioSettings />);
    act(() => setHideAudio(true));
    expect(screen.getByRole('switch', { name: 'Hide audio controls' })).toBeChecked();
  });
  it.each(['forbidden', 'unknown'] as const)(
    'shows the synthesis-only note for %s while keeping the switch enabled and reactive',
    async status => {
      publishActiveSourceLicense({ bibleName: 'Main Bible', status });
      const user = userEvent.setup();
      render(<HideAudioSettings />);
      const toggle = screen.getByRole('switch', { name: 'Hide audio controls' });
      const note = screen.getByRole('note');
      expect(note).toHaveTextContent(
        "Text-to-speech isn't available for Main Bible because of its licensing terms."
      );
      expect(toggle).toBeEnabled();
      expect(toggle).toHaveAccessibleDescription(note.textContent!);
      await user.hover(screen.getByTestId('hide-audio-card'));
      const tooltip = await screen.findByRole('tooltip');
      const ids = toggle.getAttribute('aria-describedby')?.split(' ');
      expect(ids).toContain(note.id);
      expect(ids).toContain(tooltip.id);
      await user.click(toggle);
      expect(toggle).toBeChecked();
    }
  );
  it.each(['allowed', undefined] as const)(
    'does not claim a licensing restriction for %s',
    status => {
      publishActiveSourceLicense({ bibleName: 'Main Bible', status });
      render(<HideAudioSettings />);
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(screen.getByRole('switch')).toBeEnabled();
    }
  );
  it('removes the notice when the main source clears and keeps the feature gate intact', () => {
    const release = publishActiveSourceLicense({ bibleName: 'Main Bible', status: 'unknown' });
    const { rerender } = render(<HideAudioSettings />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    act(release);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    act(() => {
      publishActiveSourceLicense({ bibleName: 'Other Bible', status: 'forbidden' });
    });
    mockFeatureFlag.mockReturnValue(false);
    rerender(<HideAudioSettings />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
