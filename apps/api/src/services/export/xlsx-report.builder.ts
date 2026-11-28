import type { Writable } from 'node:stream';
import { ZipArchive } from 'archiver';

export interface XlsxColumnDef {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  type?: 'text' | 'number' | 'decimal';
  summary?: 'sum' | 'avg';
}

export interface XlsxSheetDef {
  name: string;
  title: string;
  subtitle?: string;
  metadata?: Array<[string, string]>;
  columns: XlsxColumnDef[];
  rows: Array<Record<string, string | number | null | undefined>>;
  theme?: 'emerald' | 'blue' | 'amber';
}

function escapeXml(input: string): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sanitizeSpreadsheetText(raw: string): string {
  const trimmed = raw ?? '';
  // Proteksi Excel Formula Injection (CSV/XLSX safety) pada karakter awal berbahaya
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function sanitizeSheetName(name: string, fallbackIndex: number): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${fallbackIndex}`;
}

function colIndexToLetters(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function buildContentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, i) =>
    `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    sheetOverrides,
    '</Types>'
  ].join('\n');
}

function buildRootRelsXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>'
  ].join('\n');
}

function buildWorkbookXml(sheetNames: string[]): string {
  const sheetsXml = sheetNames
    .map((name, i) => `    <sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '  <sheets>',
    sheetsXml,
    '  </sheets>',
    '</workbook>'
  ].join('\n');
}

function buildWorkbookRelsXml(sheetCount: number): string {
  const rels = Array.from({ length: sheetCount }, (_, i) =>
    `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  );
  rels.push(
    `  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  );

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...rels,
    '</Relationships>'
  ].join('\n');
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0.0"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><i/><sz val="9"/><color rgb="FF475569"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="medium"><color rgb="FF334155"/></top>
      <bottom style="medium"><color rgb="FF334155"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="2" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="5" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="5" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;
}

function buildInlineTextCell(ref: string, text: string, styleIdx: number): string {
  const safe = escapeXml(sanitizeSpreadsheetText(text));
  return `<c r="${ref}" t="inlineStr" s="${styleIdx}"><is><t xml:space="preserve">${safe}</t></is></c>`;
}

function buildNumericCell(ref: string, value: number, styleIdx: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return `<c r="${ref}" s="${styleIdx}"><v>${safeVal}</v></c>`;
}

function buildFormulaCell(ref: string, formula: string, styleIdx: number): string {
  return `<c r="${ref}" s="${styleIdx}"><f>${escapeXml(formula)}</f></c>`;
}

function buildWorksheetXml(sheet: XlsxSheetDef): string {
  const colsXml = sheet.columns
    .map((c, idx) => `    <col min="${idx + 1}" max="${idx + 1}" width="${Math.max(8, c.width)}" customWidth="1"/>`)
    .join('\n');

  const headerStyle = sheet.theme === 'blue' ? 7 : sheet.theme === 'amber' ? 8 : 6;
  const rowsXml: string[] = [];
  let rowNum = 1;

  // Baris 1: Judul Utama Laporan
  rowsXml.push(
    `    <row r="${rowNum}" ht="24" customHeight="1">${buildInlineTextCell(`A${rowNum}`, sheet.title, 4)}</row>`
  );
  rowNum += 1;

  // Baris 2 (opsional): Subjudul
  if (sheet.subtitle) {
    rowsXml.push(
      `    <row r="${rowNum}" ht="18" customHeight="1">${buildInlineTextCell(`A${rowNum}`, sheet.subtitle, 5)}</row>`
    );
    rowNum += 1;
  }

  // Baris Metadata Ringkas
  if (sheet.metadata && sheet.metadata.length > 0) {
    for (const [label, value] of sheet.metadata) {
      rowsXml.push(
        `    <row r="${rowNum}" ht="18" customHeight="1">${buildInlineTextCell(`A${rowNum}`, label, 12)}${buildInlineTextCell(`B${rowNum}`, value, 0)}</row>`
      );
      rowNum += 1;
    }
  }

  // Spasi 1 baris kosong sebelum tabel
  rowNum += 1;
  const headerRowNum = rowNum;

  // Baris Header Kolom
  const headerCells = sheet.columns
    .map((col, colIdx) => buildInlineTextCell(`${colIndexToLetters(colIdx)}${headerRowNum}`, col.label, headerStyle))
    .join('');
  rowsXml.push(`    <row r="${headerRowNum}" ht="24" customHeight="1">${headerCells}</row>`);
  rowNum += 1;

  const dataStartRow = rowNum;

  // Baris Data
  for (const record of sheet.rows) {
    const cells = sheet.columns
      .map((col, colIdx) => {
        const ref = `${colIndexToLetters(colIdx)}${rowNum}`;
        const rawVal = record[col.key];
        if ((col.type === 'number' || col.type === 'decimal') && typeof rawVal === 'number' && Number.isFinite(rawVal)) {
          return buildNumericCell(ref, rawVal, col.type === 'decimal' ? 3 : 2);
        }
        const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
        const styleIdx = col.align === 'center' ? 1 : 0;
        return buildInlineTextCell(ref, strVal, styleIdx);
      })
      .join('');
    rowsXml.push(`    <row r="${rowNum}">${cells}</row>`);
    rowNum += 1;
  }

  const dataEndRow = rowNum - 1;
  const hasSummary = sheet.rows.length > 0 && sheet.columns.some((c) => c.summary);

  // Baris Total / Rata-rata Otomatis (Rumus OpenXML SUM / AVERAGE)
  if (hasSummary) {
    const sumCells = sheet.columns
      .map((col, colIdx) => {
        const colLetter = colIndexToLetters(colIdx);
        const ref = `${colLetter}${rowNum}`;
        if (colIdx === 0) {
          return buildInlineTextCell(ref, 'TOTAL / RATA-RATA', 9);
        }
        if (col.summary === 'sum') {
          return buildFormulaCell(ref, `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`, col.type === 'decimal' ? 11 : 10);
        }
        if (col.summary === 'avg') {
          return buildFormulaCell(ref, `AVERAGE(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`, 11);
        }
        return buildInlineTextCell(ref, '', 9);
      })
      .join('');
    rowsXml.push(`    <row r="${rowNum}" ht="22" customHeight="1">${sumCells}</row>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '  <sheetViews>',
    '    <sheetView workbookViewId="0">',
    `      <pane ySplit="${headerRowNum}" topLeftCell="A${headerRowNum + 1}" activePane="bottomLeft" state="frozen"/>`,
    '    </sheetView>',
    '  </sheetViews>',
    '  <cols>',
    colsXml,
    '  </cols>',
    '  <sheetData>',
    ...rowsXml,
    '  </sheetData>',
    '</worksheet>'
  ].join('\n');
}

export async function streamXlsxWorkbook(sheets: XlsxSheetDef[], target: Writable): Promise<void> {
  if (sheets.length === 0) {
    throw new Error('Minimal 1 worksheet diperlukan untuk membuat file Excel.');
  }

  const safeNames = sheets.map((s, i) => sanitizeSheetName(s.name, i + 1));
  const archive = new ZipArchive({ zlib: { level: 6 } });

  return new Promise((resolve, reject) => {
    archive.on('error', reject);
    target.on('error', reject);
    target.on('finish', resolve);
    target.on('close', resolve);

    archive.pipe(target);
    archive.append(buildContentTypesXml(sheets.length), { name: '[Content_Types].xml' });
    archive.append(buildRootRelsXml(), { name: '_rels/.rels' });
    archive.append(buildWorkbookXml(safeNames), { name: 'xl/workbook.xml' });
    archive.append(buildWorkbookRelsXml(sheets.length), { name: 'xl/_rels/workbook.xml.rels' });
    archive.append(buildStylesXml(), { name: 'xl/styles.xml' });

    sheets.forEach((sheet, idx) => {
      archive.append(buildWorksheetXml(sheet), { name: `xl/worksheets/sheet${idx + 1}.xml` });
    });

    archive.finalize().catch(reject);
  });
}
