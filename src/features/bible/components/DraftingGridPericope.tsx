import React, { lazy, Suspense } from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { SuggestionStatus } from '@/features/bible/hooks/useAiSuggestions';
import { hasSourceBackedVerse } from '@/features/bible/lib/pericope-navigation';
import { type SourceTtsPlaybackApi, TtsGroupControls } from '@/features/tts';
import { config } from '@/lib/config';
import {
  type PericopeGroup,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type VerseMarkers,
} from '@/lib/types';

// Loaded only when the flag is on: the editor is ~180 KB gz, and users on the textarea path must
// not pay for it (see eten-tech-foundation/scripture-editors#516).
const PericopeRteGroup = lazy(() =>
  import('@/features/bible/components/PericopeRteGroup').then(module => ({
    default: module.PericopeRteGroup,
  }))
);

/**
 * Source-TTS wiring for the pericope grid (G3a answer (b)). The unit of
 * playback here is the GROUP: one control per card reads that pericope and
 * stops at its end, and the card is washed while any of its verses is playing.
 *
 * Deliberately a different prop shape from `DraftingGridVerseTts` — this
 * surface has no per-row control and no "play from here", so borrowing that
 * interface would advertise behaviour it does not offer. `verseRefFor` is
 * shared, keeping row identity a host decision (T3).
 */
export interface DraftingGridPericopeTts extends Pick<
  SourceTtsPlaybackApi,
  'isBusy' | 'isRowPlayable' | 'isRowLoading' | 'stop'
> {
  playGroup: SourceTtsPlaybackApi['playGroup'];
  playFromGroup: SourceTtsPlaybackApi['playFromGroup'];
  isGroupSpeaking: SourceTtsPlaybackApi['isGroupSpeaking'];
  verseRefFor: (verseNumber: number) => string;
}

interface DraftingGridPericopeProps {
  pericopes: PericopeGroup[];
  sourceVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  selectedPanel: 1 | 2;
  bibleVerseMap: Map<number, string>;
  globalNextUntouchedVerse: Source | null;
  projectItem: ProjectItem;
  isTranslationComplete: boolean;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  verseRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  handleTextChange: (verseNumber: number, text: string, markers?: VerseMarkers | null) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
  handleNextPericopeClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
  /** Undefined when the source-TTS flag is off — the grid renders as before. */
  tts?: DraftingGridPericopeTts;
}

interface TargetVersesGroupProps {
  groupVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  globalNextUntouchedVerse: Source | null;
  lastSourceVerseNumber: number;
  isTranslationComplete: boolean;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string, markers?: VerseMarkers | null) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
}

export const TargetVersesGroup: React.FC<TargetVersesGroupProps> = ({
  groupVerses,
  verses,
  activeVerseId,
  readOnly,
  globalNextUntouchedVerse,
  lastSourceVerseNumber,
  isTranslationComplete,
  textareaRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
}) => {
  const { t } = useTranslation();
  const activeTargetVerse = verses.find(tv => tv.verseNumber === activeVerseId);
  const isActiveVerseEmpty = !activeTargetVerse?.content.trim();

  const activeIndex = groupVerses.findIndex(gv => gv.verseNumber === activeVerseId);
  const isAnyActive = activeIndex !== -1;

  let buttonVerseNumber: number | null = null;
  let showOutOfBoxButton = false;

  const isLastVerseOfChapter = activeVerseId === lastSourceVerseNumber;

  if (!isTranslationComplete && (!isLastVerseOfChapter || globalNextUntouchedVerse)) {
    if (isActiveVerseEmpty) {
      if (isAnyActive) {
        buttonVerseNumber = activeVerseId;
      }
    } else if (globalNextUntouchedVerse) {
      buttonVerseNumber = globalNextUntouchedVerse.verseNumber;
    } else if (isAnyActive) {
      showOutOfBoxButton = true;
    }
  }

  return (
    <>
      {groupVerses.map(v => {
        const currentTargetVerse = verses.find(tv => tv.verseNumber === v.verseNumber);
        const isButtonRow = !readOnly && buttonVerseNumber === v.verseNumber;

        return (
          <div
            key={v.verseNumber}
            className='flex w-full items-start'
            onClick={e => {
              e.stopPropagation();
              const textarea = textareaRefs.current[v.verseNumber];
              if (textarea) {
                textarea.focus();
              }
            }}
          >
            <span className='mt-0.5 mr-3 w-4 text-right text-base font-bold text-slate-900 select-none dark:text-slate-100'>
              {v.verseNumber}
            </span>
            <div className='flex min-h-[24px] flex-1 flex-col items-start justify-center'>
              <div className='relative w-full'>
                {readOnly ? (
                  <p className='w-full text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
                    {currentTargetVerse?.content ?? ''}
                  </p>
                ) : (
                  <textarea
                    ref={el => {
                      textareaRefs.current[v.verseNumber] = el;
                    }}
                    aria-label={`Translation for verse ${v.verseNumber}`}
                    autoCapitalize='sentences'
                    autoCorrect='on'
                    className={`text-foreground w-full resize-none overflow-hidden border-none bg-transparent py-0.5 text-base leading-relaxed outline-none ${
                      isButtonRow ? 'pr-16' : ''
                    }`}
                    placeholder={
                      v.verseNumber === activeVerseId &&
                      isAiActive &&
                      isAiThresholdMet &&
                      !aiSuggestions[v.verseNumber] &&
                      !currentTargetVerse?.content.trim() &&
                      suggestionStatus === 'generating'
                        ? t('generatingAiSuggestion', 'Generating...')
                        : t('typeHere', 'Type here...')
                    }
                    rows={1}
                    spellCheck={true}
                    style={
                      {
                        fieldSizing: 'content',
                      } as React.CSSProperties
                    }
                    value={currentTargetVerse?.content ?? ''}
                    onChange={e => handleTextChange(v.verseNumber, e.target.value)}
                    onFocus={() => handleActiveVerseChange(v.verseNumber)}
                    onKeyDown={handleKeyDown}
                  />
                )}

                {isButtonRow && (
                  <Button
                    className='bg-primary hover:bg-primary-hover absolute top-1/2 right-0 z-10 flex h-6 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
                    disabled={isActiveVerseEmpty}
                    onClick={handleNextClick}
                  >
                    {t('nextVerse', 'Next Verse')}
                  </Button>
                )}
              </div>

              {!readOnly &&
                v.verseNumber === activeVerseId &&
                isAiActive &&
                isAiThresholdMet &&
                !aiSuggestions[v.verseNumber] &&
                !currentTargetVerse?.content.trim() &&
                (() => {
                  switch (suggestionStatus) {
                    case 'error':
                      return (
                        <p className='text-destructive mt-1 text-sm font-medium'>
                          {t('aiTranslationNotAvailable', 'AI translation not available.')}
                        </p>
                      );
                    case 'unavailable':
                      return (
                        <p className='text-destructive mt-1 text-sm font-medium'>
                          {t(
                            'aiTranslationNotYetReady',
                            'AI translation not yet ready. Please refresh the page to view the AI translation.'
                          )}
                        </p>
                      );
                    default:
                      return null;
                  }
                })()}
            </div>
          </div>
        );
      })}
      {showOutOfBoxButton && (
        <div className='flex justify-end pt-2'>
          <Button
            className='bg-primary hover:bg-primary-hover flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white shadow-xs transition-all'
            disabled={isActiveVerseEmpty}
            onClick={handleNextClick}
          >
            {t('nextVerse', 'Next Verse')}
          </Button>
        </div>
      )}
    </>
  );
};

interface PericopeTargetGroupProps {
  pericopes: PericopeGroup[];
  groupIndex: number;
  sourceVerses: Source[];
  groupVerses: Source[];
  verses: TargetVerse[];
  activeVerseId: number;
  readOnly: boolean;
  globalNextUntouchedVerse: Source | null;
  isTranslationComplete: boolean;
  projectItem: ProjectItem;
  textareaRefs: React.MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  handleTextChange: (verseNumber: number, text: string, markers?: VerseMarkers | null) => void;
  handleActiveVerseChange: (verseNumber: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNextClick: () => Promise<void>;
  handleNextPericopeClick: () => Promise<void>;
  aiSuggestions: Record<number, string>;
  isAiThresholdMet: boolean;
  isAiActive: boolean;
  suggestionStatus: SuggestionStatus;
}

/**
 * What a pericope box shows while the editor chunk is still on the wire.
 *
 * The chunk is fetched on demand and is ~180 KB, so on a slow connection the whole target column
 * would sit blank with nothing to say a surface is coming (#400 review). One bar per verse, so the
 * box is already the shape of what lands in it and the column does not jump when it does.
 */
const PericopeEditorSkeleton: React.FC<{ verseCount: number }> = ({ verseCount }) => (
  <div
    aria-hidden='true'
    className='animate-pulse space-y-2 py-1'
    data-testid='pericope-editor-loading'
  >
    {Array.from({ length: verseCount }, (_, index) => (
      <div key={index} className='bg-muted-foreground/20 h-4 rounded' />
    ))}
  </div>
);

/**
 * The editing surface for one pericope: the rich text editor behind the flag, the per-verse
 * textareas without it.
 *
 * Every place that renders a pericope's target column goes through here, so the two surfaces can
 * never disagree about which one is on — the drafting grid and the panel-two placeholder that
 * stands in for it while the resource panel loads render the same editor (#400 review).
 */
export const PericopeTargetGroup: React.FC<PericopeTargetGroupProps> = ({
  pericopes,
  groupIndex,
  sourceVerses,
  groupVerses,
  verses,
  activeVerseId,
  readOnly,
  globalNextUntouchedVerse,
  isTranslationComplete,
  projectItem,
  textareaRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
  handleNextPericopeClick,
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
}) => {
  if (config.features.rtePericope) {
    return (
      <Suspense fallback={<PericopeEditorSkeleton verseCount={groupVerses.length} />}>
        <PericopeRteGroup
          activeVerseId={activeVerseId}
          aiSuggestions={aiSuggestions}
          bookCode={projectItem.bookCode}
          chapterAssignmentId={projectItem.chapterAssignmentId}
          chapterNumber={projectItem.chapterNumber}
          groupVerses={groupVerses}
          handleActiveVerseChange={handleActiveVerseChange}
          handleNextPericopeClick={handleNextPericopeClick}
          handleTextChange={handleTextChange}
          hasNextPericope={pericopes
            .slice(groupIndex + 1)
            .some(later => hasSourceBackedVerse(later, sourceVerses))}
          isAiActive={isAiActive}
          isAiThresholdMet={isAiThresholdMet}
          isTranslationComplete={isTranslationComplete}
          readOnly={readOnly}
          suggestionStatus={suggestionStatus}
          verses={verses}
        />
      </Suspense>
    );
  }

  return (
    <TargetVersesGroup
      activeVerseId={activeVerseId}
      aiSuggestions={aiSuggestions}
      globalNextUntouchedVerse={globalNextUntouchedVerse}
      groupVerses={groupVerses}
      handleActiveVerseChange={handleActiveVerseChange}
      handleKeyDown={handleKeyDown}
      handleNextClick={handleNextClick}
      handleTextChange={handleTextChange}
      isAiActive={isAiActive}
      isAiThresholdMet={isAiThresholdMet}
      isTranslationComplete={isTranslationComplete}
      lastSourceVerseNumber={sourceVerses[sourceVerses.length - 1]?.verseNumber ?? 0}
      readOnly={readOnly}
      suggestionStatus={suggestionStatus}
      textareaRefs={textareaRefs}
      verses={verses}
    />
  );
};

export const DraftingGridPericope: React.FC<DraftingGridPericopeProps> = ({
  pericopes,
  sourceVerses,
  verses,
  activeVerseId,
  readOnly,
  selectedPanel,
  bibleVerseMap,
  globalNextUntouchedVerse,
  projectItem,
  isTranslationComplete,
  textareaRefs,
  verseRefs,
  handleTextChange,
  handleActiveVerseChange,
  handleKeyDown,
  handleNextClick,
  handleNextPericopeClick,
  aiSuggestions,
  isAiThresholdMet,
  isAiActive,
  suggestionStatus,
  tts,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {pericopes.map((group, groupIndex) => {
        const groupVerses = sourceVerses.filter(sv =>
          group.verses.some(gv => gv.verseNumber === sv.verseNumber)
        );
        if (groupVerses.length === 0) return null;
        const verseNumbers = groupVerses.map(gv => gv.verseNumber);
        const minVerse = Math.min(...verseNumbers);
        const maxVerse = Math.max(...verseNumbers);
        const heading =
          minVerse === maxVerse
            ? `${projectItem.chapterNumber}:${minVerse}`
            : `${projectItem.chapterNumber}:${minVerse}-${maxVerse}`;

        const isGroupActive = groupVerses.some(gv => gv.verseNumber === activeVerseId);

        // G3a: playback state for this card. The refs are the group's rows in
        // document order; the hook filters them against the page's own
        // playable-item list, so an unplayable verse here costs nothing.
        const ttsGroupRefs = tts ? groupVerses.map(gv => tts.verseRefFor(gv.verseNumber)) : [];
        const isGroupSpeaking = tts?.isGroupSpeaking(ttsGroupRefs) ?? false;

        return (
          <div
            key={group.pericopeNumber}
            ref={el => {
              groupVerses.forEach(gv => {
                verseRefs.current[gv.verseNumber] = el;
              });
            }}
            // The playback marker mirrors verse mode exactly: a 4px LEFT RAIL on
            // the whole row, transparent when silent so the grid never shifts.
            // The rail is the part that reads at a glance — the card wash below
            // is only a supporting hint, which is why the wash alone was not
            // enough to show playback leaving one pericope for the next.
            className={`grid w-full items-start border-l-4 py-4 ${
              isGroupSpeaking ? 'border-l-primary bg-primary/5' : 'border-l-transparent'
            }`}
            data-testid={isGroupSpeaking ? 'tts-active-group' : undefined}
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <div className='flex w-full flex-col space-y-2 px-6'>
              <h4 className='text-base font-bold text-slate-800 select-none dark:text-slate-200'>
                {heading}
              </h4>
              <div
                // G3a: the playback wash is a BACKGROUND, deliberately not the
                // border — `border-primary` already means "the caret is in this
                // group", and a translator can be typing in one pericope while
                // another is being read aloud (T2). The two states must be
                // legible at the same time on different cards.
                className={`focus-visible:ring-primary w-full cursor-pointer rounded-[12px] border-2 p-5 shadow-xs transition-all focus:outline-hidden focus-visible:ring-2 ${
                  isGroupSpeaking ? 'bg-primary/20 dark:bg-primary/30' : 'dark:bg-card bg-[#f0f4f9]'
                } ${isGroupActive ? 'border-primary' : 'dark:border-border border-[#cfd8e3]'}`}
                role='button'
                tabIndex={0}
                onClick={() => {
                  const isGroupAlreadyActive = groupVerses.some(
                    gv => gv.verseNumber === activeVerseId
                  );
                  if (!isGroupAlreadyActive) {
                    handleActiveVerseChange(groupVerses[0].verseNumber);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const isGroupAlreadyActive = groupVerses.some(
                      gv => gv.verseNumber === activeVerseId
                    );
                    if (!isGroupAlreadyActive) {
                      handleActiveVerseChange(groupVerses[0].verseNumber);
                    }
                  }
                }}
              >
                <p className='text-base leading-relaxed text-slate-800 select-text dark:text-slate-200'>
                  {groupVerses.map(v => {
                    const textToRender =
                      selectedPanel === 1
                        ? v.text
                        : (bibleVerseMap.get(v.verseNumber) ?? t('noContentAvailable'));
                    return (
                      <React.Fragment key={v.verseNumber}>
                        <span className='mr-1.5 font-bold text-slate-900 dark:text-slate-100'>
                          {v.verseNumber}
                        </span>
                        <span
                          className={`mr-3 ${selectedPanel === 2 && !bibleVerseMap.has(v.verseNumber) ? 'text-muted-foreground text-sm' : ''}`}
                        >
                          {textToRender}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </p>
              </div>
              {/*
               * Controls sit BELOW the card, matching verse mode's reading
               * order (source text, then its controls) — and deliberately
               * OUTSIDE it: the card is itself `role='button'`, so nesting real
               * buttons inside would be invalid ARIA and every play click would
               * also bubble to the card's caret-move handler.
               */}
              {tts !== undefined && (
                <div className='flex items-center'>
                  <TtsGroupControls
                    groupLabel={heading}
                    hasPlayableText={ttsGroupRefs.some(ref => tts.isRowPlayable(ref))}
                    isLoading={ttsGroupRefs.some(ref => tts.isRowLoading(ref))}
                    isPlaying={isGroupSpeaking}
                    showStop={tts.isBusy}
                    onPlayFromGroup={() => tts.playFromGroup(ttsGroupRefs)}
                    onPlayGroup={() => tts.playGroup(ttsGroupRefs)}
                    onStop={tts.stop}
                  />
                </div>
              )}
            </div>
            <div className='flex w-full flex-col space-y-2 px-6'>
              <h4 className='text-base font-bold text-slate-800 select-none dark:text-slate-200'>
                {heading}
              </h4>
              <div
                className={`dark:bg-card w-full cursor-pointer space-y-1 rounded-[12px] border-2 bg-[#f0f4f9] p-5 transition-all ${
                  isGroupActive ? 'border-primary' : 'dark:border-border border-[#cfd8e3]'
                }`}
                onClick={e => {
                  if (e.target === e.currentTarget) {
                    const isGroupAlreadyActive = groupVerses.some(
                      gv => gv.verseNumber === activeVerseId
                    );
                    if (!isGroupAlreadyActive) {
                      handleActiveVerseChange(groupVerses[0].verseNumber);
                    }
                  }
                }}
              >
                <PericopeTargetGroup
                  activeVerseId={activeVerseId}
                  aiSuggestions={aiSuggestions}
                  globalNextUntouchedVerse={globalNextUntouchedVerse}
                  groupIndex={groupIndex}
                  groupVerses={groupVerses}
                  handleActiveVerseChange={handleActiveVerseChange}
                  handleKeyDown={handleKeyDown}
                  handleNextClick={handleNextClick}
                  handleNextPericopeClick={handleNextPericopeClick}
                  handleTextChange={handleTextChange}
                  isAiActive={isAiActive}
                  isAiThresholdMet={isAiThresholdMet}
                  isTranslationComplete={isTranslationComplete}
                  pericopes={pericopes}
                  projectItem={projectItem}
                  readOnly={readOnly}
                  sourceVerses={sourceVerses}
                  suggestionStatus={suggestionStatus}
                  textareaRefs={textareaRefs}
                  verses={verses}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
