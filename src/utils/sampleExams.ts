import { ExamPage, ExamTextBlock } from '../types/exam';

export interface SamplePaperPreset {
  id: 'tamil-ol-science' | 'sinhala-al-physics' | 'bilingual-math-paper';
  title: string;
  subtitle: string;
  languageLabel: string;
  subjectContext: string;
  generatePages: () => Promise<ExamPage[]>;
}

interface DrawTextSpec {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'ta' | 'si';
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'left' | 'center' | 'right';
  weight: 'normal' | 'bold';
  fontSize: number;
  role: ExamTextBlock['role'];
}

function createA4Canvas(isScannedLook = false): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
} {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background paper tone
  ctx.fillStyle = isScannedLook ? '#FAF8F5' : '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer examination paper border
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(56, 52, width - 112, height - 104);

  ctx.lineWidth = 1;
  ctx.strokeRect(62, 58, width - 124, height - 116);

  return { canvas, ctx, width, height };
}

function renderSpecsToPage(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  specs: DrawTextSpec[],
  pageNumber: number
): ExamPage {
  const width = canvas.width;
  const height = canvas.height;

  const blocks: ExamTextBlock[] = [];

  for (const s of specs) {
    const fontName =
      s.sourceLanguage === 'ta'
        ? "'Noto Sans Tamil', sans-serif"
        : "'Noto Sans Sinhala', sans-serif";
    ctx.font = `${s.weight === 'bold' ? '700' : '400'} ${s.fontSize}px ${fontName}`;
    ctx.fillStyle = '#0F172A';
    ctx.textBaseline = 'top';

    const drawY = s.y + Math.max(0, (s.h - s.fontSize) / 2);
    if (s.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(s.originalText, s.x + s.w / 2, drawY, s.w);
    } else if (s.align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(s.originalText, s.x + s.w, drawY, s.w);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(s.originalText, s.x, drawY, s.w);
    }

    const ymin = Math.round((s.y / height) * 1000);
    const xmin = Math.round((s.x / width) * 1000);
    const ymax = Math.round(((s.y + s.h) / height) * 1000);
    const xmax = Math.round(((s.x + s.w) / width) * 1000);

    blocks.push({
      id: s.id,
      originalText: s.originalText,
      translatedText: s.translatedText,
      sourceLanguage: s.sourceLanguage,
      box_2d: [ymin, xmin, ymax, xmax],
      alignment: s.align,
      fontWeight: s.weight,
      role: s.role,
    });
  }

  return {
    pageNumber,
    width,
    height,
    originalDataUrl: canvas.toDataURL('image/png'),
    translatedDataUrl: null,
    status: 'idle',
    blocks,
    nativeTextItems: blocks.map((b) => ({
      text: b.originalText,
      box_2d: b.box_2d,
    })),
  };
}

/**
 * Sample 1: Tamil GCE O/L Science & Technology Examination Paper (with Circuit Diagram & Observation Table)
 */
async function buildTamilSciencePaper(): Promise<ExamPage[]> {
  await document.fonts.ready;
  const { canvas, ctx, width } = createA4Canvas(false);

  // Top-right Index Number Cage
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(850, 78, 310, 56);
  // Digit boxes inside index cage
  for (let i = 0; i < 6; i++) {
    ctx.strokeRect(995 + i * 26, 90, 26, 32);
  }

  // Header divider line
  ctx.beginPath();
  ctx.moveTo(80, 265);
  ctx.lineTo(width - 80, 265);
  ctx.stroke();

  // Instruction box
  ctx.strokeRect(85, 282, width - 170, 74);

  // Section A Banner
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(85, 376, width - 170, 40);
  ctx.strokeRect(85, 376, width - 170, 40);

  // Draw Physics Circuit Diagram on right side of Q3 (x: 740..1130, y: 740..980)
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  ctx.strokeRect(755, 750, 385, 230);
  // Inner circuit loop
  ctx.beginPath();
  ctx.moveTo(830, 820);
  ctx.lineTo(1060, 820);
  ctx.lineTo(1060, 920);
  ctx.lineTo(830, 920);
  ctx.closePath();
  ctx.stroke();

  // Resistor symbol on top wire
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(910, 808, 70, 24);
  ctx.strokeRect(910, 808, 70, 24);
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.fillText('R = 12 Ω', 945, 812);

  // Ammeter circle on right wire
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(1060, 870, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0F172A';
  ctx.fillText('A', 1060, 862);

  // Battery on bottom wire
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(925, 905, 36, 30);
  ctx.beginPath();
  ctx.moveTo(936, 902);
  ctx.lineTo(936, 938);
  ctx.lineWidth = 3.5;
  ctx.moveTo(950, 910);
  ctx.lineTo(950, 930);
  ctx.stroke();
  ctx.lineWidth = 1.5;

  // Section B Banner
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(85, 1015, width - 170, 40);
  ctx.strokeRect(85, 1015, width - 170, 40);

  // Draw Experimental Table in Section B (x: 90..1140, y: 1125..1345)
  const tableX = 90;
  const tableY = 1125;
  const tableW = 1050;
  const rowH = 52;
  const col1W = 350;
  const col2W = 350;

  for (let r = 0; r <= 4; r++) {
    ctx.beginPath();
    ctx.moveTo(tableX, tableY + r * rowH);
    ctx.lineTo(tableX + tableW, tableY + r * rowH);
    ctx.stroke();
  }
  const colX = [tableX, tableX + col1W, tableX + col1W + col2W, tableX + tableW];
  for (const cx of colX) {
    ctx.beginPath();
    ctx.moveTo(cx, tableY);
    ctx.lineTo(cx, tableY + 4 * rowH);
    ctx.stroke();
  }

  // Dotted answer lines for Q4 (b) and (c)
  ctx.setLineDash([3, 5]);
  for (const lineY of [1445, 1490, 1595, 1640]) {
    ctx.beginPath();
    ctx.moveTo(125, lineY);
    ctx.lineTo(1015, lineY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const specs: DrawTextSpec[] = [
    {
      id: 'ta-1',
      originalText: 'இலங்கைப் பரீட்சைத் திணைக்களம்',
      translatedText: 'DEPARTMENT OF EXAMINATIONS, SRI LANKA',
      sourceLanguage: 'ta',
      x: 240,
      y: 82,
      w: 580,
      h: 34,
      align: 'center',
      weight: 'bold',
      fontSize: 25,
      role: 'header',
    },
    {
      id: 'ta-2',
      originalText: 'சுட்டெண் :',
      translatedText: 'Index No. :',
      sourceLanguage: 'ta',
      x: 862,
      y: 92,
      w: 125,
      h: 28,
      align: 'left',
      weight: 'bold',
      fontSize: 19,
      role: 'header',
    },
    {
      id: 'ta-3',
      originalText: 'கல்விப் பொதுத் தராதரப் பத்திர (சாதாரண தர)ப் பரீட்சை, 2026',
      translatedText: 'General Certificate of Education (Ord. Level) Examination, 2026',
      sourceLanguage: 'ta',
      x: 180,
      y: 132,
      w: 880,
      h: 32,
      align: 'center',
      weight: 'bold',
      fontSize: 22,
      role: 'header',
    },
    {
      id: 'ta-4',
      originalText: 'விஞ்ஞானம் — வினாத்தாள் I & II',
      translatedText: 'SCIENCE — PAPER I & II',
      sourceLanguage: 'ta',
      x: 310,
      y: 176,
      w: 620,
      h: 36,
      align: 'center',
      weight: 'bold',
      fontSize: 26,
      role: 'header',
    },
    {
      id: 'ta-5',
      originalText: 'காலம் : இரண்டு மணித்தியாலங்கள்',
      translatedText: 'Time : Two Hours',
      sourceLanguage: 'ta',
      x: 85,
      y: 225,
      w: 420,
      h: 28,
      align: 'left',
      weight: 'bold',
      fontSize: 19,
      role: 'header',
    },
    {
      id: 'ta-6',
      originalText: 'மொத்தப் புள்ளிகள் : 100',
      translatedText: 'Total Marks : 100',
      sourceLanguage: 'ta',
      x: 810,
      y: 225,
      w: 340,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 19,
      role: 'marks',
    },
    {
      id: 'ta-7',
      originalText: 'அறிவுறுத்தல்கள் : எல்லா வினாக்களுக்கும் இவ்வினாத்தாளிலேயே விடை எழுதுக.',
      translatedText: 'Instructions : Answer all questions on this question paper itself.',
      sourceLanguage: 'ta',
      x: 102,
      y: 292,
      w: 1030,
      h: 26,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'instruction',
    },
    {
      id: 'ta-8',
      originalText: 'பகுதி A இல் சரியான விடையைத் தெரிவுசெய்து அதன் கீழ் கோடிடுக.',
      translatedText: 'In Part A, select the most appropriate answer and underline it.',
      sourceLanguage: 'ta',
      x: 102,
      y: 322,
      w: 1030,
      h: 26,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'instruction',
    },
    {
      id: 'ta-9',
      originalText: 'பகுதி A — பல்தேர்வு வினாக்கள்',
      translatedText: 'PART A — MULTIPLE CHOICE QUESTIONS',
      sourceLanguage: 'ta',
      x: 280,
      y: 382,
      w: 680,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 20,
      role: 'header',
    },
    {
      id: 'ta-10',
      originalText: '1. தாவரக் கலங்களில் மாத்திரம் காணப்படும் பிரதான கலப்புன்னங்கம் எது?',
      translatedText: '1. Which main cellular organelle is found exclusively in plant cells?',
      sourceLanguage: 'ta',
      x: 90,
      y: 438,
      w: 910,
      h: 30,
      align: 'left',
      weight: 'normal',
      fontSize: 19,
      role: 'question',
    },
    {
      id: 'ta-11',
      originalText: '(02 புள்ளிகள்)',
      translatedText: '(02 Marks)',
      sourceLanguage: 'ta',
      x: 1015,
      y: 438,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'ta-12',
      originalText: '(1) இழைமணி',
      translatedText: '(1) Mitochondrion',
      sourceLanguage: 'ta',
      x: 120,
      y: 482,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-13',
      originalText: '(2) பச்சையவுருமணி',
      translatedText: '(2) Chloroplast',
      sourceLanguage: 'ta',
      x: 375,
      y: 482,
      w: 250,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-14',
      originalText: '(3) இரைபோசோம்',
      translatedText: '(3) Ribosome',
      sourceLanguage: 'ta',
      x: 650,
      y: 482,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-15',
      originalText: '(4) கொல்கிச் சிக்கல்',
      translatedText: '(4) Golgi Complex',
      sourceLanguage: 'ta',
      x: 900,
      y: 482,
      w: 245,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-16',
      originalText: '2. நேர்கோட்டில் இயங்கும் பொருளின் வேக-நேர வரைபின் படித்திறன் குறிப்பது யாது?',
      translatedText: '2. What does the gradient of a velocity-time graph of a body moving in a straight line represent?',
      sourceLanguage: 'ta',
      x: 90,
      y: 542,
      w: 910,
      h: 30,
      align: 'left',
      weight: 'normal',
      fontSize: 19,
      role: 'question',
    },
    {
      id: 'ta-17',
      originalText: '(02 புள்ளிகள்)',
      translatedText: '(02 Marks)',
      sourceLanguage: 'ta',
      x: 1015,
      y: 542,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'ta-18',
      originalText: '(1) இடப்பெயர்ச்சி',
      translatedText: '(1) Displacement',
      sourceLanguage: 'ta',
      x: 120,
      y: 586,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-19',
      originalText: '(2) ஆர்முடுகல்',
      translatedText: '(2) Acceleration',
      sourceLanguage: 'ta',
      x: 375,
      y: 586,
      w: 250,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-20',
      originalText: '(3) உந்தம்',
      translatedText: '(3) Momentum',
      sourceLanguage: 'ta',
      x: 650,
      y: 586,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-21',
      originalText: '(4) இயக்கப்பாட்டுச் சக்தி',
      translatedText: '(4) Kinetic Energy',
      sourceLanguage: 'ta',
      x: 900,
      y: 586,
      w: 245,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'ta-22',
      originalText: '3. அருகிலுள்ள மின்சுற்று வரிப்படத்தை அவதானித்து பின்வரும் வினாக்களுக்கு விடையளிக்குக:',
      translatedText: '3. Observe the adjacent electrical circuit diagram and answer the following questions:',
      sourceLanguage: 'ta',
      x: 90,
      y: 752,
      w: 645,
      h: 48,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-23',
      originalText: '(அ) தடை R இனூடாகப் பாயும் மின்னோட்டத்தைக் கணிக்க.',
      translatedText: '(a) Calculate the electric current flowing through resistor R.',
      sourceLanguage: 'ta',
      x: 110,
      y: 822,
      w: 620,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-24',
      originalText: '(ஆ) அம்பியர்மானியின் வாசிப்பு யாது? (மின்கலம் = 6 V)',
      translatedText: '(b) What is the reading of the ammeter? (Battery = 6 V)',
      sourceLanguage: 'ta',
      x: 110,
      y: 882,
      w: 620,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-25',
      originalText: 'தடை (R)',
      translatedText: 'Resistor (R)',
      sourceLanguage: 'ta',
      x: 885,
      y: 766,
      w: 120,
      h: 26,
      align: 'center',
      weight: 'bold',
      fontSize: 16,
      role: 'diagram_label',
    },
    {
      id: 'ta-26',
      originalText: 'மின்கலம் (6 V)',
      translatedText: 'Battery (6 V)',
      sourceLanguage: 'ta',
      x: 875,
      y: 944,
      w: 140,
      h: 26,
      align: 'center',
      weight: 'bold',
      fontSize: 16,
      role: 'diagram_label',
    },
    {
      id: 'ta-27',
      originalText: 'பகுதி B — அமைப்புக் கட்டுரை வினாக்கள்',
      translatedText: 'PART B — STRUCTURED ESSAY QUESTIONS',
      sourceLanguage: 'ta',
      x: 280,
      y: 1021,
      w: 680,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 20,
      role: 'header',
    },
    {
      id: 'ta-28',
      originalText: '4. (அ) பின்வரும் இரசாயனப் பதார்த்தங்களின் பரிசோதனை அட்டவணையைப் பூரணப்படுத்துக:',
      translatedText: '4. (a) Complete the following experimental observation table of chemical substances:',
      sourceLanguage: 'ta',
      x: 90,
      y: 1078,
      w: 920,
      h: 30,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-29',
      originalText: '(06 புள்ளிகள்)',
      translatedText: '(06 Marks)',
      sourceLanguage: 'ta',
      x: 1015,
      y: 1078,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    // Table Row 0 (Headers)
    {
      id: 'ta-30',
      originalText: 'இரசாயனக் கரைசல்',
      translatedText: 'Chemical Solution',
      sourceLanguage: 'ta',
      x: 105,
      y: 1138,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 18,
      role: 'table_cell',
    },
    {
      id: 'ta-31',
      originalText: 'பாசிச்சாயத் தாள் மாற்றம்',
      translatedText: 'Litmus Paper Colour Change',
      sourceLanguage: 'ta',
      x: 455,
      y: 1138,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 18,
      role: 'table_cell',
    },
    {
      id: 'ta-32',
      originalText: 'கரைசலின் தன்மை (அமிலம் / காரம்)',
      translatedText: 'Nature of Solution (Acidic / Basic)',
      sourceLanguage: 'ta',
      x: 805,
      y: 1138,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 18,
      role: 'table_cell',
    },
    // Table Row 1
    {
      id: 'ta-33',
      originalText: 'ஐதான ஐதரோகுளோரிக் அமிலம் (HCl)',
      translatedText: 'Dilute Hydrochloric Acid (HCl)',
      sourceLanguage: 'ta',
      x: 105,
      y: 1190,
      w: 320,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-34',
      originalText: 'நீலம் சிவப்பாக மாறும்',
      translatedText: 'Blue turns Red',
      sourceLanguage: 'ta',
      x: 455,
      y: 1190,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-35',
      originalText: 'அமிலத் தன்மை',
      translatedText: 'Acidic Nature',
      sourceLanguage: 'ta',
      x: 805,
      y: 1190,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    // Table Row 2
    {
      id: 'ta-36',
      originalText: 'சோடியம் ஐதரொட்சைட்டு (NaOH)',
      translatedText: 'Sodium Hydroxide (NaOH)',
      sourceLanguage: 'ta',
      x: 105,
      y: 1242,
      w: 320,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-37',
      originalText: 'சிவப்பு நீலமாக மாறும்',
      translatedText: 'Red turns Blue',
      sourceLanguage: 'ta',
      x: 455,
      y: 1242,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-38',
      originalText: 'காரத் தன்மை',
      translatedText: 'Basic (Alkaline) Nature',
      sourceLanguage: 'ta',
      x: 805,
      y: 1242,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    // Table Row 3
    {
      id: 'ta-39',
      originalText: 'காய்ச்சி வடித்த நீர் (H2O)',
      translatedText: 'Distilled Water (H2O)',
      sourceLanguage: 'ta',
      x: 105,
      y: 1294,
      w: 320,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-40',
      originalText: 'நிற மாற்றம் இல்லை',
      translatedText: 'No Colour Change',
      sourceLanguage: 'ta',
      x: 455,
      y: 1294,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    {
      id: 'ta-41',
      originalText: 'நடுநிலைத் தன்மை',
      translatedText: 'Neutral Nature',
      sourceLanguage: 'ta',
      x: 805,
      y: 1294,
      w: 320,
      h: 28,
      align: 'center',
      weight: 'normal',
      fontSize: 17,
      role: 'table_cell',
    },
    // Structured Essay Sub-questions below table
    {
      id: 'ta-42',
      originalText: '(ஆ) அமிலம் ஒன்றிற்கும் காரம் ஒன்றிற்கும் இடையிலான நடுநிலையாக்கல் தாக்கத்தைச் சமன்பாட்டுடன் தருக.',
      translatedText: '(b) State the neutralization reaction between an acid and a base with a balanced chemical equation.',
      sourceLanguage: 'ta',
      x: 90,
      y: 1380,
      w: 920,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-43',
      originalText: '(05 புள்ளிகள்)',
      translatedText: '(05 Marks)',
      sourceLanguage: 'ta',
      x: 1015,
      y: 1380,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'ta-44',
      originalText: '(இ) நன்றாகக் கழுவப்பட்ட சோதனைக் குழாயில் பரிசோதனையைச் செய்வதன் முக்கியத்துவம் யாது?',
      translatedText: '(c) What is the importance of conducting the experiment in a thoroughly washed test tube?',
      sourceLanguage: 'ta',
      x: 90,
      y: 1530,
      w: 920,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'ta-45',
      originalText: '(05 புள்ளிகள்)',
      translatedText: '(05 Marks)',
      sourceLanguage: 'ta',
      x: 1015,
      y: 1530,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'ta-46',
      originalText: '[பக்கம் 1 / 2 — அடுத்த பக்கத்தைப் பார்க்க]',
      translatedText: '[Page 1 of 2 — Turn over to next page]',
      sourceLanguage: 'ta',
      x: 340,
      y: 1658,
      w: 560,
      h: 26,
      align: 'center',
      weight: 'bold',
      fontSize: 16,
      role: 'footer',
    },
  ];

  return [renderSpecsToPage(canvas, ctx, specs, 1)];
}

/**
 * Sample 2: Sinhala GCE A/L Physics & Mechanics Examination Paper (with Pendulum Figure & Structured Questions)
 */
async function buildSinhalaPhysicsPaper(): Promise<ExamPage[]> {
  await document.fonts.ready;
  const { canvas, ctx, width } = createA4Canvas(true); // Slight warm photo-scanned look

  // Top-right Index Number Cage
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(840, 78, 320, 56);

  // Header divider line
  ctx.beginPath();
  ctx.moveTo(80, 265);
  ctx.lineTo(width - 80, 265);
  ctx.stroke();

  // Instruction box
  ctx.strokeRect(85, 282, width - 170, 74);

  // Section A Banner
  ctx.fillStyle = '#EFECE6';
  ctx.fillRect(85, 376, width - 170, 40);
  ctx.strokeRect(85, 376, width - 170, 40);

  // Simple Pendulum Diagram in Q3 right box (x: 755..1140, y: 745..1010)
  ctx.strokeRect(755, 745, 385, 260);
  // Ceiling support
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(890, 775);
  ctx.lineTo(1010, 775);
  ctx.stroke();
  // String & bob
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(950, 775);
  ctx.lineTo(950, 915);
  ctx.stroke();
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(950, 932, 17, 0, Math.PI * 2);
  ctx.fill();

  // Dotted answer lines for Part B
  ctx.setLineDash([3, 5]);
  for (const lineY of [1185, 1230, 1365, 1410, 1545, 1590]) {
    ctx.beginPath();
    ctx.moveTo(125, lineY);
    ctx.lineTo(1015, lineY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const specs: DrawTextSpec[] = [
    {
      id: 'si-1',
      originalText: 'ශ්‍රී ලංකා විභාග දෙපාර්තමේන්තුව',
      translatedText: 'DEPARTMENT OF EXAMINATIONS, SRI LANKA',
      sourceLanguage: 'si',
      x: 240,
      y: 82,
      w: 580,
      h: 34,
      align: 'center',
      weight: 'bold',
      fontSize: 25,
      role: 'header',
    },
    {
      id: 'si-2',
      originalText: 'විභාග අංකය : ........................',
      translatedText: 'Index No. : ........................',
      sourceLanguage: 'si',
      x: 855,
      y: 92,
      w: 290,
      h: 28,
      align: 'left',
      weight: 'bold',
      fontSize: 19,
      role: 'header',
    },
    {
      id: 'si-3',
      originalText: 'අධ්‍යයන පොදු සහතික පත්‍ර (උසස් පෙළ) විභාගය, 2026',
      translatedText: 'General Certificate of Education (Adv. Level) Examination, 2026',
      sourceLanguage: 'si',
      x: 180,
      y: 132,
      w: 880,
      h: 32,
      align: 'center',
      weight: 'bold',
      fontSize: 22,
      role: 'header',
    },
    {
      id: 'si-4',
      originalText: 'භෞතික විද්‍යාව — I හා II පත්‍රය',
      translatedText: 'PHYSICS — PAPER I & II',
      sourceLanguage: 'si',
      x: 310,
      y: 176,
      w: 620,
      h: 36,
      align: 'center',
      weight: 'bold',
      fontSize: 26,
      role: 'header',
    },
    {
      id: 'si-5',
      originalText: 'කාලය : පැය දෙකයි',
      translatedText: 'Time : Two Hours',
      sourceLanguage: 'si',
      x: 85,
      y: 225,
      w: 420,
      h: 28,
      align: 'left',
      weight: 'bold',
      fontSize: 19,
      role: 'header',
    },
    {
      id: 'si-6',
      originalText: 'මුළු ලකුණු : 100',
      translatedText: 'Total Marks : 100',
      sourceLanguage: 'si',
      x: 810,
      y: 225,
      w: 340,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 19,
      role: 'marks',
    },
    {
      id: 'si-7',
      originalText: 'උපදෙස් : සියලුම ප්‍රශ්නවලට පිළිතුරු මෙම ප්‍රශ්න පත්‍රයේම සපයන්න.',
      translatedText: 'Instructions : Answer all questions on this question paper itself.',
      sourceLanguage: 'si',
      x: 102,
      y: 292,
      w: 1030,
      h: 26,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'instruction',
    },
    {
      id: 'si-8',
      originalText: 'ගුරුත්වජ ත්වරණය g = 10 m s⁻² ලෙස ගන්න. නිවැරදි ඒකක සඳහන් කරන්න.',
      translatedText: 'Take acceleration due to gravity g = 10 m s⁻². State appropriate SI units clearly.',
      sourceLanguage: 'si',
      x: 102,
      y: 322,
      w: 1030,
      h: 26,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'instruction',
    },
    {
      id: 'si-9',
      originalText: 'A කොටස — බහුවරණ හා ව්‍යුහගත ප්‍රශ්න',
      translatedText: 'PART A — MULTIPLE CHOICE & STRUCTURED QUESTIONS',
      sourceLanguage: 'si',
      x: 260,
      y: 382,
      w: 720,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 20,
      role: 'header',
    },
    {
      id: 'si-10',
      originalText: '1. බලයේ මාන නිවැරදිව දැක්වෙන පිළිතුර කුමක්ද?',
      translatedText: '1. Which option correctly represents the dimensions of Force?',
      sourceLanguage: 'si',
      x: 90,
      y: 440,
      w: 910,
      h: 30,
      align: 'left',
      weight: 'normal',
      fontSize: 19,
      role: 'question',
    },
    {
      id: 'si-11',
      originalText: '(ලකුණු 02)',
      translatedText: '(02 Marks)',
      sourceLanguage: 'si',
      x: 1015,
      y: 440,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'si-12',
      originalText: '(1) MLT⁻¹',
      translatedText: '(1) MLT⁻¹',
      sourceLanguage: 'si',
      x: 120,
      y: 484,
      w: 220,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-13',
      originalText: '(2) MLT⁻²',
      translatedText: '(2) MLT⁻²',
      sourceLanguage: 'si',
      x: 375,
      y: 484,
      w: 220,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-14',
      originalText: '(3) ML²T⁻²',
      translatedText: '(3) ML²T⁻²',
      sourceLanguage: 'si',
      x: 650,
      y: 484,
      w: 220,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-15',
      originalText: '(4) ML⁻¹T⁻²',
      translatedText: '(4) ML⁻¹T⁻²',
      sourceLanguage: 'si',
      x: 900,
      y: 484,
      w: 220,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-16',
      originalText: '2. ඒකාකාර වෘත්ත චලිතයේ යෙදෙන අංශුවක නියතව පවතින භෞතික රාශිය කුමක්ද?',
      translatedText: '2. Which physical quantity remains constant for a particle moving in uniform circular motion?',
      sourceLanguage: 'si',
      x: 90,
      y: 545,
      w: 910,
      h: 30,
      align: 'left',
      weight: 'normal',
      fontSize: 19,
      role: 'question',
    },
    {
      id: 'si-17',
      originalText: '(ලකුණු 02)',
      translatedText: '(02 Marks)',
      sourceLanguage: 'si',
      x: 1015,
      y: 545,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'si-18',
      originalText: '(1) ප්‍රවේගය',
      translatedText: '(1) Velocity',
      sourceLanguage: 'si',
      x: 120,
      y: 588,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-19',
      originalText: '(2) කේන්ද්‍රාභිසාරී ත්වරණය',
      translatedText: '(2) Centripetal Acceleration',
      sourceLanguage: 'si',
      x: 375,
      y: 588,
      w: 260,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-20',
      originalText: '(3) කෝණික වේගය',
      translatedText: '(3) Angular Speed',
      sourceLanguage: 'si',
      x: 655,
      y: 588,
      w: 230,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-21',
      originalText: '(4) රේඛීය ගම්‍යතාව',
      translatedText: '(4) Linear Momentum',
      sourceLanguage: 'si',
      x: 900,
      y: 588,
      w: 245,
      h: 28,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'option',
    },
    {
      id: 'si-22',
      originalText: '3. දකුණු පස රූපයේ දැක්වෙන සරල අවලම්බය භාවිතයෙන් ගුරුත්වජ ත්වරණය (g) සෙවීමේ පරීක්ෂණය සලකන්න:',
      translatedText: '3. Consider the experiment to determine acceleration due to gravity (g) using the simple pendulum shown on the right:',
      sourceLanguage: 'si',
      x: 90,
      y: 752,
      w: 645,
      h: 50,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-23',
      originalText: '(අ) අවලම්බයේ ආවර්ත කාලය (T) හා දිග (L) අතර සම්බන්ධතාව ලියන්න.',
      translatedText: '(a) Write down the relationship between the period of oscillation (T) and length (L) of the pendulum.',
      sourceLanguage: 'si',
      x: 110,
      y: 825,
      w: 620,
      h: 44,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-24',
      originalText: '(ආ) දෝලන 20 ක් සඳහා ගතවන කාලය මැනීම වඩාත් සුදුසු වන්නේ ඇයි?',
      translatedText: '(b) Why is it more accurate to measure the time taken for 20 oscillations?',
      sourceLanguage: 'si',
      x: 110,
      y: 895,
      w: 620,
      h: 44,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-25',
      originalText: 'තන්තුවේ දිග (L)',
      translatedText: 'String Length (L)',
      sourceLanguage: 'si',
      x: 965,
      y: 835,
      w: 160,
      h: 28,
      align: 'left',
      weight: 'bold',
      fontSize: 16,
      role: 'diagram_label',
    },
    {
      id: 'si-26',
      originalText: 'අවලම්බ බට්ටා',
      translatedText: 'Pendulum Bob',
      sourceLanguage: 'si',
      x: 870,
      y: 962,
      w: 160,
      h: 28,
      align: 'center',
      weight: 'bold',
      fontSize: 16,
      role: 'diagram_label',
    },
    {
      id: 'si-27',
      originalText: '4. (අ) නිව්ටන්ගේ දෙවන චලිත නියමය ප්‍රකාශ කර එහි සම්මත සූත්‍රය ව්‍යුත්පන්න කරන්න.',
      translatedText: "4. (a) State Newton's Second Law of Motion and derive its standard mathematical expression.",
      sourceLanguage: 'si',
      x: 90,
      y: 1118,
      w: 920,
      h: 32,
      align: 'left',
      weight: 'bold',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-28',
      originalText: '(ලකුණු 05)',
      translatedText: '(05 Marks)',
      sourceLanguage: 'si',
      x: 1015,
      y: 1118,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'si-29',
      originalText: '(ආ) ස්කන්ධය 4 kg වූ වස්තුවක් මත 20 N බලයක් තත්පර 5 ක් ක්‍රියා කරයි නම් ලබාගන්නා ප්‍රවේගය සොයන්න.',
      translatedText: '(b) If a force of 20 N acts on a body of mass 4 kg for 5 seconds, find the final velocity acquired.',
      sourceLanguage: 'si',
      x: 90,
      y: 1300,
      w: 920,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-30',
      originalText: '(ලකුණු 05)',
      translatedText: '(05 Marks)',
      sourceLanguage: 'si',
      x: 1015,
      y: 1300,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'si-31',
      originalText: '(ඇ) ශක්ති සංස්ථිති නියමය සඳහන් කර ප්‍රායෝගික උදාහරණයක් මගින් පැහැදිලි කරන්න.',
      translatedText: '(c) State the Principle of Conservation of Energy and explain it using a practical example.',
      sourceLanguage: 'si',
      x: 90,
      y: 1480,
      w: 920,
      h: 32,
      align: 'left',
      weight: 'normal',
      fontSize: 18,
      role: 'question',
    },
    {
      id: 'si-32',
      originalText: '(ලකුණු 05)',
      translatedText: '(05 Marks)',
      sourceLanguage: 'si',
      x: 1015,
      y: 1480,
      w: 135,
      h: 28,
      align: 'right',
      weight: 'bold',
      fontSize: 17,
      role: 'marks',
    },
    {
      id: 'si-33',
      originalText: '[1 වන පිටුව — සියලුම හිමිකම් ඇවිරිණි]',
      translatedText: '[Page 1 — All Rights Reserved]',
      sourceLanguage: 'si',
      x: 340,
      y: 1658,
      w: 560,
      h: 26,
      align: 'center',
      weight: 'bold',
      fontSize: 16,
      role: 'footer',
    },
  ];

  return [renderSpecsToPage(canvas, ctx, specs, 1)];
}

export const SAMPLE_EXAM_PRESETS: SamplePaperPreset[] = [
  {
    id: 'tamil-ol-science',
    title: 'GCE O/L Science Paper (Tamil)',
    subtitle: 'Includes circuit diagram, experimental observation table, MCQs & structured answer lines',
    languageLabel: 'Tamil (தமிழ்)',
    subjectContext: 'GCE O/L Science, Physics & Chemistry Examination Paper',
    generatePages: buildTamilSciencePaper,
  },
  {
    id: 'sinhala-al-physics',
    title: 'GCE A/L Physics Paper (Sinhala — Scanned)',
    subtitle: 'Includes pendulum diagram, dimensional analysis MCQs, index cage & structured problems',
    languageLabel: 'Sinhala (සිංහල)',
    subjectContext: 'GCE A/L Physics & Mechanics Examination Paper',
    generatePages: buildSinhalaPhysicsPaper,
  },
];
