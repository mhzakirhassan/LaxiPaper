import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  RefreshCw,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Eye,
  Columns,
  Layers,
} from 'lucide-react';
import {
  ExamPage,
  ExamTextBlock,
  RenderConfig,
  TextAlignment,
  BlockRole,
} from './types/exam';
import {
  extractPagesFromFile,
  renderTranslatedPageDataUrl,
  exportTranslatedExamPdf,
} from './utils/pageRenderer';
import { SAMPLE_EXAM_PRESETS, SamplePaperPreset } from './utils/sampleExams';

type ViewportMode = 'side-by-side' | 'translated-only' | 'spatial-overlay';

export default function App() {
  const [pages, setPages] = useState<ExamPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [documentName, setDocumentName] = useState<string>('GCE_OL_Science_Tamil_2026.pdf');
  const [sourceLangHint, setSourceLangHint] = useState<'auto' | 'ta' | 'si'>('auto');
  const [subjectContext, setSubjectContext] = useState<string>('Science & Physics Examination');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('side-by-side');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Selected block for fine-tuning translation, alignment, or coordinates
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockSearchQuery, setBlockSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isRefiningBlock, setIsRefiningBlock] = useState<boolean>(false);
  const [refineNote, setRefineNote] = useState<string | null>(null);

  // Page processing and PDF export states
  const [isExtractingFile, setIsExtractingFile] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Layout reconstruction render config
  const [renderConfig, setRenderConfig] = useState<RenderConfig>({
    fontFamily: 'serif',
    patchMode: 'adaptive',
    enhanceScanContrast: false,
    showAlignmentGuides: false,
    globalFontScale: 1.0,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePage: ExamPage | undefined = pages[activePageIndex];
  const selectedBlock: ExamTextBlock | undefined = activePage?.blocks.find(
    (b) => b.id === selectedBlockId
  );

  // Re-render active page canvas whenever blocks or renderConfig change
  const refreshPageTranslationCanvas = useCallback(
    async (pageIdx: number, currentBlocks: ExamTextBlock[], cfg: RenderConfig, origUrl: string) => {
      try {
        const renderedUrl = await renderTranslatedPageDataUrl(origUrl, currentBlocks, cfg);
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === pageIdx
              ? {
                  ...p,
                  translatedDataUrl: renderedUrl,
                }
              : p
          )
        );
      } catch (err) {
        console.error('Failed to render translated canvas:', err);
      }
    },
    []
  );

  useEffect(() => {
    if (!activePage || activePage.blocks.length === 0) return;
    refreshPageTranslationCanvas(
      activePageIndex,
      activePage.blocks,
      renderConfig,
      activePage.originalDataUrl
    );
  }, [
    activePageIndex,
    activePage?.blocks,
    activePage?.originalDataUrl,
    renderConfig,
    refreshPageTranslationCanvas,
  ]);

  // Load initial Tamil sample exam paper on mount so the workspace is immediately populated and interactive
  useEffect(() => {
    handleLoadSamplePreset(SAMPLE_EXAM_PRESETS[0], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadSamplePreset = async (preset: SamplePaperPreset, useLiveGemini = false) => {
    setGlobalError(null);
    setIsExtractingFile(true);
    try {
      const generatedPages = await preset.generatePages();
      setDocumentName(
        preset.id === 'tamil-ol-science'
          ? 'GCE_OL_Science_Tamil_Paper.pdf'
          : 'GCE_AL_Physics_Sinhala_Paper.pdf'
      );
      setSubjectContext(preset.subjectContext);
      setSourceLangHint(preset.id === 'tamil-ol-science' ? 'ta' : 'si');

      if (!useLiveGemini) {
        // Render immediate spatial reconstruction from verified sample blocks
        const firstPage = generatedPages[0];
        const renderedDataUrl = await renderTranslatedPageDataUrl(
          firstPage.originalDataUrl,
          firstPage.blocks,
          renderConfig
        );
        const readyPage: ExamPage = {
          ...firstPage,
          translatedDataUrl: renderedDataUrl,
          status: 'completed',
          detectedLanguage: preset.languageLabel,
          paperTitle: preset.title,
          processingTimeMs: 420,
        };
        setPages([readyPage]);
        setActivePageIndex(0);
        setSelectedBlockId(readyPage.blocks[0]?.id ?? null);
      } else {
        // Clear pre-baked blocks and run live Gemini Vision OCR + Translation
        const rawPages: ExamPage[] = generatedPages.map((p) => ({
          ...p,
          blocks: [],
          status: 'idle',
        }));
        setPages(rawPages);
        setActivePageIndex(0);
        await translateSinglePage(0, rawPages[0], preset.id === 'tamil-ol-science' ? 'ta' : 'si', preset.subjectContext);
      }
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load sample exam paper.');
    } finally {
      setIsExtractingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
    e.target.value = '';
  };

  const processUploadedFile = async (file: File) => {
    setGlobalError(null);
    setIsExtractingFile(true);
    setSelectedBlockId(null);

    try {
      const extractedPages = await extractPagesFromFile(file);
      setDocumentName(file.name);
      setPages(extractedPages);
      setActivePageIndex(0);
      setIsExtractingFile(false);

      // Automatically translate page 1 upon upload
      if (extractedPages.length > 0) {
        await translateSinglePage(0, extractedPages[0], sourceLangHint, subjectContext);
      }
    } catch (err: unknown) {
      setIsExtractingFile(false);
      setGlobalError(
        err instanceof Error
          ? err.message
          : 'Could not read the uploaded file. Please upload a valid PDF or image file.'
      );
    }
  };

  const translateSinglePage = async (
    pageIndex: number,
    pageObj?: ExamPage,
    langHintOverride?: 'auto' | 'ta' | 'si',
    subjectOverride?: string
  ) => {
    const targetPage = pageObj || pages[pageIndex];
    if (!targetPage) return;

    const startTime = performance.now();
    setGlobalError(null);

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === pageIndex ? { ...p, status: 'translating', errorMessage: undefined } : p
      )
    );

    try {
      const response = await fetch('/api/translate-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: targetPage.originalDataUrl,
          mimeType: 'image/png',
          sourceLangHint: langHintOverride ?? sourceLangHint,
          subjectContext: subjectOverride ?? subjectContext,
          nativeTextItems: targetPage.nativeTextItems,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server failed to translate exam page.');
      }

      const rawBlocks: ExamTextBlock[] = Array.isArray(data.blocks)
        ? data.blocks.map((b: ExamTextBlock, i: number) => ({
            id: b.id || `block-${pageIndex + 1}-${i + 1}`,
            originalText: b.originalText || '',
            translatedText: b.translatedText || '',
            sourceLanguage: b.sourceLanguage || 'ta',
            box_2d:
              Array.isArray(b.box_2d) && b.box_2d.length === 4
                ? [
                    Math.max(0, Math.min(1000, Number(b.box_2d[0]) || 0)),
                    Math.max(0, Math.min(1000, Number(b.box_2d[1]) || 0)),
                    Math.max(0, Math.min(1000, Number(b.box_2d[2]) || 50)),
                    Math.max(0, Math.min(1000, Number(b.box_2d[3]) || 200)),
                  ]
                : [50, 50, 90, 450],
            alignment:
              b.alignment === 'center' || b.alignment === 'right' ? b.alignment : 'left',
            fontWeight: b.fontWeight === 'bold' ? 'bold' : 'normal',
            role: b.role || 'question',
            fontSizeScale: 1.0,
          }))
        : [];

      const renderedDataUrl = await renderTranslatedPageDataUrl(
        targetPage.originalDataUrl,
        rawBlocks,
        renderConfig
      );

      const elapsedMs = Math.round(performance.now() - startTime);

      setPages((prev) =>
        prev.map((p, idx) =>
          idx === pageIndex
            ? {
                ...p,
                status: 'completed',
                detectedLanguage: data.detectedLanguage || 'Sinhala / Tamil',
                paperTitle: data.paperTitle || documentName,
                blocks: rawBlocks,
                translatedDataUrl: renderedDataUrl,
                processingTimeMs: elapsedMs,
              }
            : p
        )
      );

      if (rawBlocks.length > 0) {
        setSelectedBlockId(rawBlocks[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Translation failed.';
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === pageIndex ? { ...p, status: 'error', errorMessage: msg } : p
        )
      );
      setGlobalError(msg);
    }
  };

  const translateAllPages = async () => {
    for (let i = 0; i < pages.length; i++) {
      setActivePageIndex(i);
      await translateSinglePage(i, pages[i]);
    }
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<ExamTextBlock>) => {
    setPages((prev) =>
      prev.map((page, idx) => {
        if (idx !== activePageIndex) return page;
        return {
          ...page,
          blocks: page.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
        };
      })
    );
  };

  const handleNudgeBox = (
    blockId: string,
    coordIndex: 0 | 1 | 2 | 3,
    delta: number
  ) => {
    if (!activePage) return;
    const target = activePage.blocks.find((b) => b.id === blockId);
    if (!target) return;
    const nextBox: [number, number, number, number] = [...target.box_2d] as [
      number,
      number,
      number,
      number,
    ];
    nextBox[coordIndex] = Math.max(0, Math.min(1000, nextBox[coordIndex] + delta));
    handleUpdateBlock(blockId, { box_2d: nextBox });
  };

  const handleAddCustomBlock = () => {
    if (!activePage) return;
    const newId = `custom-${Date.now()}`;
    const newBlock: ExamTextBlock = {
      id: newId,
      originalText: '(புதிய வாக்கியம் / නව පාඨය)',
      translatedText: 'New translated text block',
      sourceLanguage: sourceLangHint === 'si' ? 'si' : 'ta',
      box_2d: [450, 120, 480, 620],
      alignment: 'left',
      fontWeight: 'normal',
      role: 'question',
      fontSizeScale: 1.0,
    };
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, blocks: [...p.blocks, newBlock] } : p
      )
    );
    setSelectedBlockId(newId);
  };

  const handleDeleteBlock = (blockId: string) => {
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex
          ? { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }
          : p
      )
    );
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const handleRefineBlockWithAI = async (block: ExamTextBlock) => {
    setIsRefiningBlock(true);
    setRefineNote(null);
    try {
      const response = await fetch('/api/refine-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: block.originalText,
          currentTranslation: block.translatedText,
          subjectContext,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine block');
      }
      if (data.translatedText) {
        handleUpdateBlock(block.id, { translatedText: data.translatedText });
      }
      if (data.terminologyNotes) {
        setRefineNote(data.terminologyNotes);
      }
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Could not refine block.');
    } finally {
      setIsRefiningBlock(false);
    }
  };

  const handleExportPdf = async () => {
    if (pages.length === 0) return;
    setIsExportingPdf(true);
    try {
      await exportTranslatedExamPdf(pages, documentName, renderConfig);
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to export PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredBlocks = (activePage?.blocks ?? []).filter((b) => {
    const matchesRole = roleFilter === 'all' || b.role === roleFilter;
    const q = blockSearchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      b.originalText.toLowerCase().includes(q) ||
      b.translatedText.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  const completedPagesCount = pages.filter((p) => p.status === 'completed').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Hidden file input for PDF and Image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          LexiPaper
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#workspace"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Workspace
          </a>
          <a
            href="#alignment-inspector"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Alignment Inspector
          </a>
          <a
            href="#sample-papers"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Sample Papers
          </a>
          <a
            href="#specifications"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Specifications
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportPdf}
            disabled={pages.length === 0 || isExportingPdf}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download Translated PDF</span>
          </button>
        </div>
      </header>

      {/* Contextual Workspace Control Strip */}
      <section
        id="workspace"
        className="bg-white border-b border-slate-200 px-6 py-4"
      >
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Document Identity & Unboxed Metadata */}
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                {activePage?.paperTitle || documentName}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span>{documentName}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Source: {activePage?.detectedLanguage || 'Sinhala & Tamil Auto-Detect'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Target: Formal Examination English</span>
                {activePage && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {activePage.blocks.length} aligned blocks
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {activePage.width}×{activePage.height}px
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Preserves exact spatial coordinates, diagrams, tables, question numbering, and mark allocations across digital or photo-scanned exam papers.
            </p>
          </div>

          {/* Right: Upload, Source Language & Live Gemini Translation Actions */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Upload PDF / Image Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtractingFile}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isExtractingFile ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-slate-700" />
              )}
              <span>Upload Exam PDF / Scan</span>
            </button>

            {/* Segmented Source Script Selector */}
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
              role="group"
              aria-label="Source language selection"
            >
              {(
                [
                  { id: 'auto', label: 'Auto (සිං / தமிழ்)' },
                  { id: 'ta', label: 'Tamil (தமிழ்)' },
                  { id: 'si', label: 'Sinhala (සිංහල)' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSourceLangHint(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sourceLangHint === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Run Live AI OCR & Spatial Translation on Current Page */}
            <button
              onClick={() => translateSinglePage(activePageIndex)}
              disabled={!activePage || activePage.status === 'translating'}
              className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-amber-400/90 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activePage?.status === 'translating' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {activePage?.status === 'translating'
                  ? 'Detecting & Translating...'
                  : 'Run AI Spatial Translation'}
              </span>
            </button>

            {pages.length > 1 && (
              <button
                onClick={translateAllPages}
                disabled={activePage?.status === 'translating'}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Translate All ({pages.length} Pages)
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Error Alert Banner if any */}
      {globalError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-xs font-medium text-red-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Secondary Toolbar: Viewport Mode, Typography & Layout Preservation Controls */}
      <div className="bg-slate-100/80 border-b border-slate-200 px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Viewport Mode Tabs + Page Navigation */}
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
              <button
                onClick={() => setViewportMode('side-by-side')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  viewportMode === 'side-by-side'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side Alignment</span>
              </button>
              <button
                onClick={() => setViewportMode('translated-only')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  viewportMode === 'translated-only'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Translated Exam Paper</span>
              </button>
              <button
                onClick={() => setViewportMode('spatial-overlay')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  viewportMode === 'spatial-overlay'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Detected OCR Boxes</span>
              </button>
            </div>

            {/* Multi-page pagination controls */}
            {pages.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-700 font-mono-tabular">
                <button
                  onClick={() => setActivePageIndex((i) => Math.max(0, i - 1))}
                  disabled={activePageIndex === 0}
                  className="p-1.5 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2">
                  Page {activePageIndex + 1} of {pages.length} ({completedPagesCount}/{pages.length} ready)
                </span>
                <button
                  onClick={() =>
                    setActivePageIndex((i) => Math.min(pages.length - 1, i + 1))
                  }
                  disabled={activePageIndex >= pages.length - 1}
                  className="p-1.5 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Typesetting & Scan Controls */}
          <div className="flex items-center flex-wrap gap-3 text-xs">
            {/* Font style selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Exam Typeface:</span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-md">
                <button
                  onClick={() =>
                    setRenderConfig((c) => ({ ...c, fontFamily: 'serif' }))
                  }
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    renderConfig.fontFamily === 'serif'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Academic Serif
                </button>
                <button
                  onClick={() =>
                    setRenderConfig((c) => ({ ...c, fontFamily: 'sans' }))
                  }
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    renderConfig.fontFamily === 'sans'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Clean Sans
                </button>
              </div>
            </div>

            {/* Background Patch Mode */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Paper Mask:</span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-md">
                <button
                  onClick={() =>
                    setRenderConfig((c) => ({ ...c, patchMode: 'adaptive' }))
                  }
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    renderConfig.patchMode === 'adaptive'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Adaptive Paper Tone
                </button>
                <button
                  onClick={() =>
                    setRenderConfig((c) => ({ ...c, patchMode: 'crisp-white' }))
                  }
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    renderConfig.patchMode === 'crisp-white'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pure White
                </button>
              </div>
            </div>

            {/* Photo Scan Whitening Toggle */}
            <button
              onClick={() =>
                setRenderConfig((c) => ({
                  ...c,
                  enhanceScanContrast: !c.enhanceScanContrast,
                }))
              }
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                renderConfig.enhanceScanContrast
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Whiten Photo Scan
            </button>

            {/* Alignment Guides Toggle */}
            <button
              onClick={() =>
                setRenderConfig((c) => ({
                  ...c,
                  showAlignmentGuides: !c.showAlignmentGuides,
                }))
              }
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                renderConfig.showAlignmentGuides
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Alignment Grid</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-mono-tabular">
              <button
                onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-xs">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(175, z + 15))}
                className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Left/Center Exam Paper Canvas + Right Spatial Alignment Inspector */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Exam Paper Canvas Viewport */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {!activePage ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  No Examination Paper Loaded
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Upload a Sinhala (සිංහල) or Tamil (தமிழ்) exam paper in PDF or image format, or choose one of the sample examination papers below.
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Select Exam PDF or Image</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-200/70 border border-slate-300 rounded-xl p-4 overflow-x-auto">
              {/* Loading Overlay during AI Translation */}
              {activePage.status === 'translating' && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs text-blue-900">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                    <span>
                      Running spatial OCR & bounding-box extraction for Sinhala/Tamil script and aligning formal English translations...
                    </span>
                  </div>
                  <span className="text-xs font-mono-tabular text-blue-700 whitespace-nowrap">
                    Preserving Page Geometry
                  </span>
                </div>
              )}

              {/* SIDE-BY-SIDE VIEW */}
              {viewportMode === 'side-by-side' && (
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start mx-auto transition-transform"
                  style={{
                    width: zoomLevel > 100 ? `${zoomLevel}%` : '100%',
                  }}
                >
                  {/* Left Sheet: Original Sinhala / Tamil Exam Page */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span className="font-semibold text-slate-800">
                        Original Source Paper ({activePage.detectedLanguage || 'Tamil / Sinhala'})
                      </span>
                      <span className="font-mono-tabular">
                        Page {activePage.pageNumber} · Click any region to inspect
                      </span>
                    </div>
                    <div className="relative bg-white border border-slate-300 shadow-xs rounded overflow-hidden">
                      <img
                        src={activePage.originalDataUrl}
                        alt={`Original exam page ${activePage.pageNumber}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto block select-none"
                      />
                      {/* Interactive clickable hover hotspots over original blocks */}
                      {activePage.blocks.map((block) => {
                        const [ymin, xmin, ymax, xmax] = block.box_2d;
                        const isSelected = block.id === selectedBlockId;
                        return (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() => setSelectedBlockId(block.id)}
                            title={`${block.originalText} → ${block.translatedText}`}
                            style={{
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              height: `${Math.max(1.2, (ymax - ymin) / 10)}%`,
                              width: `${Math.max(2, (xmax - xmin) / 10)}%`,
                            }}
                            className={`absolute transition-colors cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-blue-600 bg-blue-500/15 z-10'
                                : 'hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-400/60'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Sheet: Reconstructed Aligned English Exam Page */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span className="font-semibold text-slate-800">
                        Translated English Paper (Exact Spatial Alignment)
                      </span>
                      <span className="font-mono-tabular">
                        {activePage.processingTimeMs
                          ? `Aligned in ${activePage.processingTimeMs} ms`
                          : 'Print-Ready Vector Layout'}
                      </span>
                    </div>
                    <div className="relative bg-white border border-slate-300 shadow-xs rounded overflow-hidden">
                      <img
                        src={activePage.translatedDataUrl || activePage.originalDataUrl}
                        alt={`Translated English exam page ${activePage.pageNumber}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto block select-none"
                      />
                      {/* Interactive clickable hotspots on translated sheet */}
                      {activePage.blocks.map((block) => {
                        const [ymin, xmin, ymax, xmax] = block.box_2d;
                        const isSelected = block.id === selectedBlockId;
                        return (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() => setSelectedBlockId(block.id)}
                            title={`Click to edit: ${block.translatedText}`}
                            style={{
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              height: `${Math.max(1.2, (ymax - ymin) / 10)}%`,
                              width: `${Math.max(2, (xmax - xmin) / 10)}%`,
                            }}
                            className={`absolute transition-colors cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-blue-600 bg-blue-500/10 z-10'
                                : 'hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-400/60'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSLATED EXAM PAPER ONLY VIEW */}
              {viewportMode === 'translated-only' && (
                <div
                  className="mx-auto space-y-2"
                  style={{
                    width: `${Math.min(100, Math.max(55, zoomLevel * 0.85))}%`,
                  }}
                >
                  <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                    <span className="font-semibold text-slate-800">
                      Translated English Examination Paper — Click any sentence on the sheet to edit in place
                    </span>
                    <span className="font-mono-tabular">
                      {activePage.blocks.length} aligned regions
                    </span>
                  </div>
                  <div className="relative bg-white border border-slate-300 shadow-xs rounded overflow-hidden">
                    <img
                      src={activePage.translatedDataUrl || activePage.originalDataUrl}
                      alt={`Translated exam page ${activePage.pageNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block select-none"
                    />
                    {activePage.blocks.map((block) => {
                      const [ymin, xmin, ymax, xmax] = block.box_2d;
                      const isSelected = block.id === selectedBlockId;
                      return (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => setSelectedBlockId(block.id)}
                          title={block.translatedText}
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            height: `${Math.max(1.2, (ymax - ymin) / 10)}%`,
                            width: `${Math.max(2, (xmax - xmin) / 10)}%`,
                          }}
                          className={`absolute transition-colors cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-blue-600 bg-blue-500/10 z-10'
                              : 'hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-400/60'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SPATIAL OCR OVERLAY VIEW */}
              {viewportMode === 'spatial-overlay' && (
                <div
                  className="mx-auto space-y-2"
                  style={{
                    width: `${Math.min(100, Math.max(55, zoomLevel * 0.85))}%`,
                  }}
                >
                  <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                    <span className="font-semibold text-slate-800">
                      Spatial Bounding-Box Verification Overlay (0–1000 Normalized Coordinates)
                    </span>
                    <span className="font-mono-tabular">
                      {activePage.blocks.length} boxes mapped
                    </span>
                  </div>
                  <div className="relative bg-white border border-slate-300 shadow-xs rounded overflow-hidden">
                    <img
                      src={activePage.originalDataUrl}
                      alt="Spatial overlay base"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block select-none"
                    />
                    {activePage.blocks.map((block, i) => {
                      const [ymin, xmin, ymax, xmax] = block.box_2d;
                      const isSelected = block.id === selectedBlockId;
                      return (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => setSelectedBlockId(block.id)}
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            height: `${Math.max(1.4, (ymax - ymin) / 10)}%`,
                            width: `${Math.max(2, (xmax - xmin) / 10)}%`,
                          }}
                          className={`absolute text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-blue-600 bg-blue-600/20 z-20'
                              : 'ring-1 ring-blue-500/60 bg-blue-500/10 hover:bg-blue-500/20'
                          }`}
                        >
                          <span className="bg-slate-900/85 text-white text-[10px] font-mono-tabular px-1 py-0.2 rounded-br block w-fit leading-tight">
                            #{i + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sample Examination Papers Bar (Quick Loaders) */}
          <section
            id="sample-papers"
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Reference Sinhala & Tamil Examination Papers
                </h2>
                <p className="text-xs text-slate-500">
                  Test layout-preserving translation on structured exam sheets with circuit diagrams, pendulum figures, observation tables, and mark cages.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
                A4 Standard · 1240×1754 DPI
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SAMPLE_EXAM_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{preset.languageLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{preset.subjectContext}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {preset.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {preset.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleLoadSamplePreset(preset, false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Load Aligned Sample
                    </button>
                    <button
                      onClick={() => handleLoadSamplePreset(preset, true)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Re-Analyze Live with Gemini</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right 4 Columns: Spatial Alignment & Translation Inspector */}
        <aside
          id="alignment-inspector"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden sticky top-16"
        >
          {/* Inspector Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Spatial Alignment Inspector
              </h2>
              <p className="text-xs text-slate-500">
                Fine-tune translated sentences, coordinates, and typography in real time
              </p>
            </div>
            <button
              onClick={handleAddCustomBlock}
              disabled={!activePage}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              title="Add custom translated block"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Block</span>
            </button>
          </div>

          {/* Active Selected Block Editor */}
          {selectedBlock ? (
            <div className="p-5 bg-slate-50/70 border-b border-slate-200 space-y-4">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5 font-mono-tabular">
                  <span className="font-semibold text-slate-800">
                    Block {selectedBlock.id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Role: {selectedBlock.role}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    [{selectedBlock.box_2d.join(', ')}]
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteBlock(selectedBlock.id)}
                  className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                  title="Remove this text block"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Original Detected Tamil / Sinhala Text */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Detected Source Text ({selectedBlock.sourceLanguage === 'si' ? 'Sinhala' : 'Tamil'})
                </label>
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 select-all leading-relaxed">
                  {selectedBlock.originalText}
                </div>
              </div>

              {/* Editable English Translation */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="translated-textarea"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Aligned English Translation
                  </label>
                  <button
                    onClick={() => handleRefineBlockWithAI(selectedBlock)}
                    disabled={isRefiningBlock}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    {isRefiningBlock ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>Refine Academic Term</span>
                  </button>
                </div>
                <textarea
                  id="translated-textarea"
                  rows={2}
                  value={selectedBlock.translatedText}
                  onChange={(e) =>
                    handleUpdateBlock(selectedBlock.id, {
                      translatedText: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 leading-relaxed"
                />
                {refineNote && (
                  <p className="text-[11px] text-slate-600 bg-blue-50/80 border border-blue-200 rounded px-2.5 py-1.5">
                    {refineNote}
                  </p>
                )}
              </div>

              {/* Alignment, Weight & Font Scale Controls */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {/* Alignment */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-slate-500">Alignment</span>
                  <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5">
                    {(
                      [
                        { align: 'left', icon: AlignLeft },
                        { align: 'center', icon: AlignCenter },
                        { align: 'right', icon: AlignRight },
                      ] as { align: TextAlignment; icon: React.ElementType }[]
                    ).map(({ align, icon: Icon }) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() =>
                          handleUpdateBlock(selectedBlock.id, { alignment: align })
                        }
                        className={`flex-1 py-1 flex justify-center rounded text-xs cursor-pointer ${
                          selectedBlock.alignment === align
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title={`Align ${align}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Weight */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-slate-500">Weight</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateBlock(selectedBlock.id, {
                        fontWeight:
                          selectedBlock.fontWeight === 'bold' ? 'normal' : 'bold',
                      })
                    }
                    className={`w-full py-1.5 px-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1 cursor-pointer ${
                      selectedBlock.fontWeight === 'bold'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" />
                    <span>{selectedBlock.fontWeight === 'bold' ? 'Bold' : 'Regular'}</span>
                  </button>
                </div>

                {/* Font Size Scale */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-slate-500 font-mono-tabular">
                    Scale ({Math.round((selectedBlock.fontSizeScale ?? 1) * 100)}%)
                  </span>
                  <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 font-mono-tabular">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateBlock(selectedBlock.id, {
                          fontSizeScale: Math.max(
                            0.65,
                            Number(((selectedBlock.fontSizeScale ?? 1) - 0.08).toFixed(2))
                          ),
                        })
                      }
                      className="flex-1 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateBlock(selectedBlock.id, { fontSizeScale: 1.0 })
                      }
                      className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      Fit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateBlock(selectedBlock.id, {
                          fontSizeScale: Math.min(
                            1.5,
                            Number(((selectedBlock.fontSizeScale ?? 1) + 0.08).toFixed(2))
                          ),
                        })
                      }
                      className="flex-1 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-millimeter Coordinate Nudge Controls */}
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3 h-3" />
                    <span>Spatial Position & Box Width Adjustment</span>
                  </span>
                  <span className="font-mono-tabular">
                    X:{selectedBlock.box_2d[1]} Y:{selectedBlock.box_2d[0]}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono-tabular">
                  <button
                    type="button"
                    onClick={() => {
                      handleNudgeBox(selectedBlock.id, 1, -4);
                      handleNudgeBox(selectedBlock.id, 3, -4);
                    }}
                    className="py-1 px-2 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    ← Left
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNudgeBox(selectedBlock.id, 1, 4);
                      handleNudgeBox(selectedBlock.id, 3, 4);
                    }}
                    className="py-1 px-2 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    Right →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNudgeBox(selectedBlock.id, 0, -3);
                      handleNudgeBox(selectedBlock.id, 2, -3);
                    }}
                    className="py-1 px-2 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNudgeBox(selectedBlock.id, 0, 3);
                      handleNudgeBox(selectedBlock.id, 2, 3);
                    }}
                    className="py-1 px-2 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    Down ↓
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-50/60 border-b border-slate-200 text-xs text-slate-500">
              Select any sentence block on the exam paper canvas or from the list below to edit its English translation or adjust its spatial alignment.
            </div>
          )}

          {/* Filter & Search Bar for Page Sentence Blocks */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={blockSearchQuery}
                onChange={(e) => setBlockSearchQuery(e.target.value)}
                placeholder="Search Sinhala, Tamil, or English text..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'header', label: 'Headers' },
                  { id: 'question', label: 'Questions' },
                  { id: 'option', label: 'Options' },
                  { id: 'table_cell', label: 'Table Cells' },
                  { id: 'diagram_label', label: 'Diagrams' },
                  { id: 'marks', label: 'Marks' },
                ] as { id: 'all' | BlockRole; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    roleFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable List of All Aligned Text Blocks on Active Page */}
          <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100">
            {filteredBlocks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No aligned text blocks match the current filter.
              </div>
            ) : (
              filteredBlocks.map((block, index) => {
                const isSelected = block.id === selectedBlockId;
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => setSelectedBlockId(block.id)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[11px] font-mono-tabular text-slate-400 pt-0.5 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        {block.translatedText}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {block.originalText}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono-tabular">
                        <span>{block.role}</span>
                        <span aria-hidden="true">·</span>
                        <span>align: {block.alignment}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          y:{block.box_2d[0]} x:{block.box_2d[1]}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </main>

      {/* Architectural Specifications & Layout Preservation Guarantee Section */}
      <section
        id="specifications"
        className="bg-white border-t border-slate-200 mt-12 px-6 py-12"
      >
        <div className="max-w-[1440px] mx-auto space-y-8">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              How LexiPaper Preserves Exact Examination Structure & Alignment
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Standard document translators strip tables, diagrams, and question columns into unformatted paragraphs. LexiPaper treats every examination sheet as a coordinate-locked canvas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>01. Hybrid PDF & Photo-Scan Detection</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Combines native PDF text-matrix extraction with Gemini Vision 2D bounding-box recognition (`[ymin, xmin, ymax, xmax]`) to detect Tamil (`தமிழ்`) and Sinhala (`සිංහල`) sentences across both digital PDFs and camera-scanned papers.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>02. Non-Destructive Diagram & Table Retention</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Samples local paper background luminance around each text box to mask only the source script glyphs while leaving electrical circuits, geometry figures, table gridlines, index number cages, and dotted answer lines untouched.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>03. Auto-Fitting Examination Typesetting</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Calculates optimal font sizing and line wrapping so longer English translations fit inside the exact spatial footprint of the concise Tamil or Sinhala source text without overflowing into adjacent columns or mark allocations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-slate-50 border-t border-slate-200 px-6 py-6 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            LexiPaper — Sinhala & Tamil Examination Paper Spatial Translation Studio
          </span>
          <div className="flex items-center gap-4">
            <a href="#workspace" className="hover:text-slate-900">
              Top of Workspace
            </a>
            <span aria-hidden="true">·</span>
            <button
              onClick={handleExportPdf}
              disabled={pages.length === 0}
              className="hover:text-slate-900 disabled:opacity-50 cursor-pointer"
            >
              Export Translated PDF
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
