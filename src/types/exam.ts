export type TextAlignment = 'left' | 'center' | 'right';
export type FontWeightType = 'normal' | 'bold';
export type BlockRole =
  | 'header'
  | 'instruction'
  | 'question'
  | 'option'
  | 'table_cell'
  | 'diagram_label'
  | 'marks'
  | 'footer';

export interface NativePdfTextItem {
  text: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0..1000
}

export interface ExamTextBlock {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'ta' | 'si' | 'en' | string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0..1000
  alignment: TextAlignment;
  fontWeight: FontWeightType;
  role: BlockRole;
  fontSizeScale?: number; // 1.0 = auto-fit default, user adjustable
}

export interface ExamPage {
  pageNumber: number;
  width: number;
  height: number;
  originalDataUrl: string;
  translatedDataUrl: string | null;
  status: 'idle' | 'translating' | 'completed' | 'error';
  detectedLanguage?: string;
  paperTitle?: string;
  blocks: ExamTextBlock[];
  nativeTextItems: NativePdfTextItem[];
  errorMessage?: string;
  processingTimeMs?: number;
}

export interface RenderConfig {
  fontFamily: 'serif' | 'sans';
  patchMode: 'adaptive' | 'crisp-white';
  enhanceScanContrast: boolean;
  showAlignmentGuides: boolean;
  globalFontScale: number;
}
