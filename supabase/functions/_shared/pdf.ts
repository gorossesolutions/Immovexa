// Mise en page PDF générique — ne connaît que des chaînes/nombres, aucun
// vocabulaire métier (pas de "bail", "locataire", "loyer"...). Le fichier
// appelant (generate-charge-pdf) est seul responsable de résoudre ce
// vocabulaire avant d'appeler ce module, même discipline que la séparation
// SQL 0007 (billing générique) / 0008 (pont immobilier).
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

export interface PdfRow {
  label: string;
  value: string;
}

export interface PdfDocumentSpec {
  orgName: string;
  title: string;
  rows: PdfRow[];
  highlightLabel?: string;
  highlightValue?: string;
  footerNote?: string;
}

export async function buildSimplePdf(spec: PdfDocumentSpec): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.1, 0.1, 0.12);
  const gray = rgb(0.45, 0.45, 0.48);
  const lightGray = rgb(0.85, 0.85, 0.87);

  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(spec.orgName, { x: MARGIN, y, size: 13, font: boldFont, color: dark });
  const dateLabel = new Date().toLocaleDateString("fr-FR");
  const dateWidth = font.widthOfTextAtSize(dateLabel, 9);
  page.drawText(dateLabel, { x: PAGE_WIDTH - MARGIN - dateWidth, y: y + 2, size: 9, font, color: gray });

  y -= 40;
  page.drawText(spec.title, { x: MARGIN, y, size: 18, font: boldFont, color: dark });
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: lightGray });
  y -= 30;

  for (const row of spec.rows) {
    page.drawText(row.label, { x: MARGIN, y, size: 10, font, color: gray });
    page.drawText(row.value, { x: MARGIN + 180, y, size: 10, font: boldFont, color: dark });
    y -= 22;
  }

  if (spec.highlightLabel && spec.highlightValue) {
    y -= 10;
    const boxHeight = 55;
    page.drawRectangle({
      x: MARGIN,
      y: y - boxHeight + 15,
      width: PAGE_WIDTH - 2 * MARGIN,
      height: boxHeight,
      color: rgb(0.96, 0.97, 0.99),
    });
    page.drawText(spec.highlightLabel, { x: MARGIN + 15, y: y - 5, size: 10, font, color: gray });
    page.drawText(spec.highlightValue, { x: MARGIN + 15, y: y - 27, size: 20, font: boldFont, color: rgb(0.04, 0.05, 0.2) });
    y -= boxHeight + 10;
  }

  if (spec.footerNote) {
    page.drawText(spec.footerNote, { x: MARGIN, y: 40, size: 8, font, color: gray });
  }

  return pdfDoc.save();
}
