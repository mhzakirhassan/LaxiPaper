import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { jsPDF } from 'jspdf';
import { ExamPage, ExamTextBlock, NativePdfTextItem, RenderConfig } from '../types/exam';

// Configure local worker bundled by Vite so it works offline/in sandboxed environments
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extracts high-DPI page images and any embedded native PDF text coordinates from a PDF or Image file.
 */
export async function extractPagesFromFile(file: File): Promise<ExamPage[]> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    const dataUrl = await readFileAsDataUrl(file);
    const { width, height } = await getImageDimensions(dataUrl);
    return [
      {
        pageNumber: 1,
        width,
        height,
        originalDataUrl: dataUrl,
        translatedDataUrl: null,
        status: 'idle',
        blocks: [],
        nativeTextItems: [],
      },
    ];
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const pages: ExamPage[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    // Render at high-DPI scale (2.0) for crisp typography & diagram preservation
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D canvas context');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    // Extract native PDF text items if available (helps align digital PDFs with sub-pixel accuracy)
    const nativeTextItems: NativePdfTextItem[] = [];
    try {
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim().length > 0 && Array.isArray(item.transform)) {
          // PDF coordinates have origin at bottom-left; transform to viewport top-left
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]) || (item.height ? item.height * scale : 16);
          const x = tx[4];
          const y = tx[5] - fontHeight;
          const w = (item.width ? item.width * scale : item.str.length * (fontHeight * 0.55));
          const h = fontHeight * 1.25;

          const ymin = Math.max(0, Math.min(1000, Math.round((y / canvas.height) * 1000)));
          const xmin = Math.max(0, Math.min(1000, Math.round((x / canvas.width) * 1000)));
          const ymax = Math.max(0, Math.min(1000, Math.round(((y + h) / canvas.height) * 1000)));
          const xmax = Math.max(0, Math.min(1000, Math.round(((x + w) / canvas.width) * 1000)));

          if (ymax > ymin && xmax > xmin) {
            nativeTextItems.push({
              text: item.str.trim(),
              box_2d: [ymin, xmin, ymax, xmax],
            });
          }
        }
      }
    } catch {
      // Scanned PDF without text layer — handled smoothly by Gemini vision OCR
    }

    pages.push({
      pageNumber: i,
      width: canvas.width,
      height: canvas.height,
      originalDataUrl: canvas.toDataURL('image/png'),
      translatedDataUrl: null,
      status: 'idle',
      blocks: [],
      nativeTextItems,
    });
  }

  return pages;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Samples the local background color just around a text bounding box on the original exam page,
 * ignoring dark ink/table border pixels so the erased patch blends seamlessly with the paper.
 */
function sampleLocalPaperBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  canvasWidth: number,
  canvasHeight: number
): string {
  const sx = Math.max(0, Math.floor(x - 3));
  const sy = Math.max(0, Math.floor(y - 3));
  const sw = Math.min(canvasWidth - sx, Math.ceil(w + 6));
  const sh = Math.min(canvasHeight - sy, Math.ceil(h + 6));

  if (sw <= 0 || sh <= 0) return '#FFFFFF';

  try {
    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    // Sample perimeter and bright interior pixels (luminance > 165) to capture paper tone
    const step = Math.max(1, Math.floor((sw * sh) / 250));
    for (let i = 0; i < imgData.length; i += 4 * step) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 165) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }

    if (count === 0) return '#FFFFFF';
    const rAvg = Math.round(rSum / count);
    const gAvg = Math.round(gSum / count);
    const bAvg = Math.round(bSum / count);
    return `rgb(${rAvg}, ${gAvg}, ${bAvg})`;
  } catch {
    return '#FFFFFF';
  }
}

/**
 * Splits a single line of text into wrapped lines that fit within `maxWidth` at current ctx.font.
 */
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const allLines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === '')) {
      allLines.push('');
      continue;
    }

    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      const metrics = ctx.measureText(testLine);
      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        allLines.push(currentLine);
        currentLine = word;
      }
    }
    allLines.push(currentLine);
  }

  return allLines;
}

/**
 * Reconstructs the exam paper page by masking out the original Sinhala/Tamil text blocks
 * and typesetting the English translations in the exact same spatial bounding boxes.
 */
export async function renderTranslatedPageDataUrl(
  originalDataUrl: string,
  blocks: ExamTextBlock[],
  config: RenderConfig
): Promise<string> {
  const img = await loadImage(originalDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for rendering');

  // 1. Draw original exam page (retaining all borders, cages, diagrams, tables, and lines)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 2. Optional photo-scan illumination normalization (whitens gray camera background while keeping ink sharp)
  if (config.enhanceScanContrast) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 195) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else if (lum < 95) {
        const darken = Math.max(0, lum * 0.65);
        data[i] = darken;
        data[i + 1] = darken;
        data[i + 2] = darken;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Compute pixel boxes for all blocks
  const computedBoxes = blocks.map((block) => {
    const [ymin, xmin, ymax, xmax] = block.box_2d;
    const x = (xmin / 1000) * canvas.width;
    const y = (ymin / 1000) * canvas.height;
    const w = Math.max(16, ((xmax - xmin) / 1000) * canvas.width);
    const h = Math.max(12, ((ymax - ymin) / 1000) * canvas.height);
    const bgFill =
      config.patchMode === 'crisp-white'
        ? '#FFFFFF'
        : sampleLocalPaperBackground(ctx, x, y, w, h, canvas.width, canvas.height);
    return { block, x, y, w, h, bgFill };
  });

  // 3. PASS 1: Erase original Sinhala/Tamil text inside each block's bounding box
  for (const item of computedBoxes) {
    const { x, y, w, h, bgFill } = item;
    // Slight 1.5px inset/outset balance so glyphs are fully covered without erasing surrounding table gridlines
    const padX = Math.min(3, w * 0.02);
    const padY = Math.min(2, h * 0.04);
    ctx.fillStyle = bgFill;
    ctx.fillRect(x - padX, y - padY, w + padX * 2, h + padY * 2);
  }

  // 4. PASS 2: Typeset translated English text into the exact same bounding boxes
  const fontStack =
    config.fontFamily === 'serif'
      ? "'Source Serif 4', Georgia, 'Times New Roman', Times, serif"
      : "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  for (const item of computedBoxes) {
    const { block, x, y, w, h } = item;
    const text = (block.translatedText || '').trim();
    if (!text) continue;

    const weight = block.fontWeight === 'bold' || block.role === 'header' ? '700' : '400';
    const userScale = (block.fontSizeScale ?? 1.0) * config.globalFontScale;

    // Determine upper & lower font size bounds proportional to bounding box and page resolution
    const minFontPx = Math.max(9, Math.round(canvas.height * 0.0072));
    const maxRoleRatio =
      block.role === 'header' ? 0.78 : block.role === 'marks' || block.role === 'option' ? 0.68 : 0.72;
    let fontSize = Math.min(Math.round(h * maxRoleRatio), Math.round(canvas.height * 0.032));
    fontSize = Math.max(minFontPx, fontSize);

    const lineHeightMultiplier = 1.18;
    let wrappedLines: string[] = [text];

    // Iteratively fit font size so wrapped lines fit both horizontally and vertically in [w, h]
    while (fontSize >= minFontPx) {
      ctx.font = `${weight} ${fontSize}px ${fontStack}`;
      wrappedLines = wrapTextLines(ctx, text, w * 0.98);
      const totalTextHeight = wrappedLines.length * fontSize * lineHeightMultiplier;
      const widestLine = Math.max(...wrappedLines.map((l) => ctx.measureText(l).width), 0);

      if (totalTextHeight <= h * 1.12 && widestLine <= w * 1.03) {
        break;
      }
      fontSize -= 1;
    }

    // Apply user scale multiplier
    const finalFontSize = Math.max(8, Math.round(fontSize * userScale));
    ctx.font = `${weight} ${finalFontSize}px ${fontStack}`;
    wrappedLines = wrapTextLines(ctx, text, w * 1.02);

    const lineStep = finalFontSize * lineHeightMultiplier;
    const totalBlockTextHeight = wrappedLines.length * lineStep;

    ctx.fillStyle = '#0F172A';
    ctx.textBaseline = 'top';

    // Vertical alignment: center single-line items inside their row box; top-align multi-line questions
    const startY =
      wrappedLines.length === 1 && totalBlockTextHeight < h
        ? y + (h - finalFontSize) / 2
        : y + Math.max(0, (h - totalBlockTextHeight) * 0.25);

    for (let lineIdx = 0; lineIdx < wrappedLines.length; lineIdx++) {
      const lineStr = wrappedLines[lineIdx];
      const lineY = startY + lineIdx * lineStep;

      // Avoid drawing way outside box if user forced huge text
      if (lineY > y + h * 1.35 && lineIdx > 0) break;

      if (block.alignment === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(lineStr, x + w / 2, lineY, w * 1.04);
      } else if (block.alignment === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(lineStr, x + w, lineY, w * 1.04);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(lineStr, x, lineY, w * 1.04);
      }
    }

    // Optional alignment guide overlay
    if (config.showAlignmentGuides) {
      ctx.save();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Generates and downloads a print-ready, multi-page PDF with exact original layout and proportions.
 */
export async function exportTranslatedExamPdf(
  pages: ExamPage[],
  filename: string,
  config: RenderConfig
): Promise<void> {
  if (pages.length === 0) return;

  const firstPage = pages[0];
  const firstOrientation = firstPage.width > firstPage.height ? 'l' : 'p';

  // Use points (pt) matching standard A4 width (595.28pt) while preserving exact page aspect ratio
  const pdfWidthPt = firstOrientation === 'p' ? 595.28 : 841.89;
  const pdfHeightPt = (firstPage.height / firstPage.width) * pdfWidthPt;

  const pdf = new jsPDF({
    orientation: firstOrientation,
    unit: 'pt',
    format: [pdfWidthPt, pdfHeightPt],
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const orientation = page.width > page.height ? 'l' : 'p';
    const pageW = orientation === 'p' ? 595.28 : 841.89;
    const pageH = (page.height / page.width) * pageW;

    if (i > 0) {
      pdf.addPage([pageW, pageH], orientation);
    }

    // Ensure clean rendering without blue alignment guides in exported PDF
    const exportConfig: RenderConfig = {
      ...config,
      showAlignmentGuides: false,
    };

    const renderedDataUrl =
      page.blocks.length > 0
        ? await renderTranslatedPageDataUrl(page.originalDataUrl, page.blocks, exportConfig)
        : page.translatedDataUrl || page.originalDataUrl;

    pdf.addImage(renderedDataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  }

  const cleanName = filename.replace(/\.(pdf|png|jpg|jpeg|webp)$/i, '');
  pdf.save(`${cleanName}_English_Translated.pdf`);
}
