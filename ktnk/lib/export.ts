import type { ExportRow } from "@/lib/types";

export const exportHeaders = [
  "作業日",
  "予定",
  "一次会社",
  "一次会社人数",
  "二次会社",
  "二次会社人数",
  "作業エリア",
  "作業内容",
  "次回来場予定日",
  "次回一次会社人数",
  "次回二次会社",
  "次回二次会社人数",
  "次回作業内容",
  "登録日時",
  "更新日時",
] as const;

export function rowToArray(row: ExportRow) {
  return [
    row.workDate,
    row.status,
    row.primaryCompany,
    row.primaryCount,
    row.secondaryCompany,
    row.secondaryCount,
    row.workArea,
    row.workContent,
    row.nextVisitDate,
    row.nextPrimaryCount,
    row.nextSecondaryCompany,
    row.nextSecondaryCount,
    row.nextWorkContent,
    row.createdAt,
    row.updatedAt,
  ];
}

export async function buildScheduleWorkbook(rows: ExportRow[]) {
  const byDate = groupRowsByDate(rows);
  const dates = Object.keys(byDate).sort();
  const sheets =
    dates.length === 0
      ? [{ name: "作業予定", rows: [[...exportHeaders]] }]
      : dates.map((date) => ({
          name: safeSheetName(date),
          rows: [[...exportHeaders], ...byDate[date].map(rowToArray)],
        }));

  return buildXlsx(sheets);
}

export function buildScheduleCsv(rows: ExportRow[]) {
  const lines = [exportHeaders, ...rows.map(rowToArray)];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}

export function exportFileName(params: { dateFrom?: string | null; dateTo?: string | null; format: "xlsx" | "csv" }) {
  const prefix =
    params.dateFrom && params.dateTo && params.dateFrom !== params.dateTo
      ? `${params.dateFrom}_${params.dateTo}`
      : params.dateFrom || params.dateTo || "all";

  return `${prefix}_作業予定.${params.format}`;
}

function groupRowsByDate(rows: ExportRow[]) {
  return rows.reduce<Record<string, ExportRow[]>>((acc, row) => {
    acc[row.workDate] ??= [];
    acc[row.workDate].push(row);
    return acc;
  }, {});
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

type SheetPayload = {
  name: string;
  rows: unknown[][];
};

type ZipEntryInput = {
  name: string;
  content: string;
};

type ZipEntry = {
  nameBuffer: Buffer;
  data: Buffer;
  crc: number;
  offset: number;
};

function buildXlsx(sheets: SheetPayload[]) {
  const entries: ZipEntryInput[] = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", content: packageRelsXml() },
    { name: "docProps/app.xml", content: appXml() },
    { name: "docProps/core.xml", content: coreXml() },
    { name: "xl/workbook.xml", content: workbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    { name: "xl/styles.xml", content: stylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet.rows),
    })),
  ];

  return createZip(entries);
}

function contentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;
}

function packageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function appXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>ktnk</Application>
</Properties>`;
}

function coreXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>作業予定</dc:title>
  <dc:creator>ktnk</dc:creator>
  <cp:lastModifiedBy>ktnk</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function workbookXml(sheets: SheetPayload[]) {
  const sheetXml = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`;
}

function workbookRelsXml(sheetCount: number) {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Yu Gothic"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Yu Gothic"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(rows: unknown[][]) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, colIndex) => cellXml(rowNumber, colIndex + 1, value, rowIndex === 0 ? 1 : 0))
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="12" customWidth="1"/>
    <col min="3" max="3" width="24" customWidth="1"/>
    <col min="4" max="4" width="14" customWidth="1"/>
    <col min="5" max="5" width="24" customWidth="1"/>
    <col min="6" max="6" width="14" customWidth="1"/>
    <col min="7" max="8" width="22" customWidth="1"/>
    <col min="9" max="15" width="18" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:O1"/>
</worksheet>`;
}

function cellXml(row: number, col: number, value: unknown, style: number) {
  const ref = `${columnName(col)}${row}`;
  const styleAttr = style > 0 ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${styleAttr}/>`;
  }
  if (typeof value === "number") {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(String(value))}</t></is></c>`;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let name = "";
  let cursor = index;
  while (cursor > 0) {
    const mod = (cursor - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    cursor = Math.floor((cursor - mod) / 26);
  }
  return name;
}

function createZip(inputs: ZipEntryInput[]) {
  const entries: ZipEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const input of inputs) {
    const nameBuffer = Buffer.from(input.name, "utf8");
    const data = Buffer.from(input.content, "utf8");
    const crc = crc32(data);
    const localHeader = createLocalHeader(nameBuffer, data, crc);

    entries.push({ nameBuffer, data, crc, offset });
    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;
  }

  const centralParts = entries.map(createCentralDirectoryHeader);
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = createEndOfCentralDirectory(entries.length, centralSize, offset);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function createLocalHeader(nameBuffer: Buffer, data: Buffer, crc: number) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer]);
}

function createCentralDirectoryHeader(entry: ZipEntry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.nameBuffer]);
}

function createEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
