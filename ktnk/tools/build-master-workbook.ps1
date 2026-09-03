param(
    [string]$OutputPath = "ktnk\excel\作業予定マスタ.xlsx"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function XmlEscape([object]$Value) {
    if ($null -eq $Value) { return "" }
    return [System.Security.SecurityElement]::Escape([string]$Value)
}

function ColumnName([int]$Index) {
    $name = ""
    while ($Index -gt 0) {
        $mod = ($Index - 1) % 26
        $name = [char](65 + $mod) + $name
        $Index = [math]::Floor(($Index - $mod) / 26)
    }
    return $name
}

function CellXml([int]$Row, [int]$Col, [object]$Value, [int]$Style = 0) {
    $ref = "$(ColumnName $Col)$Row"
    $styleAttr = if ($Style -gt 0) { " s=`"$Style`"" } else { "" }
    if ($null -eq $Value -or [string]$Value -eq "") {
        return "<c r=`"$ref`"$styleAttr/>"
    }
    return "<c r=`"$ref`" t=`"inlineStr`"$styleAttr><is><t>$(XmlEscape $Value)</t></is></c>"
}

function RowXml([int]$RowNumber, [object[]]$Values, [int]$Style = 0) {
    $cells = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $Values.Count; $i++) {
        $cells.Add((CellXml $RowNumber ($i + 1) $Values[$i] $Style))
    }
    return "<row r=`"$RowNumber`">$($cells -join '')</row>"
}

function WorksheetXml([object]$Rows, [int]$FrozenRows = 1) {
    $sheetData = New-Object System.Collections.Generic.List[string]
    for ($r = 0; $r -lt $Rows.Count; $r++) {
        $style = if ($r -eq 0) { 2 } else { 0 }
        $sheetData.Add((RowXml ($r + 1) $Rows[$r] $style))
    }

    $cols = @"
<cols>
  <col min="1" max="1" width="14" customWidth="1"/>
  <col min="2" max="2" width="14" customWidth="1"/>
  <col min="3" max="3" width="22" customWidth="1"/>
  <col min="4" max="4" width="18" customWidth="1"/>
  <col min="5" max="5" width="14" customWidth="1"/>
  <col min="6" max="6" width="22" customWidth="1"/>
  <col min="7" max="7" width="14" customWidth="1"/>
  <col min="8" max="9" width="20" customWidth="1"/>
  <col min="10" max="15" width="18" customWidth="1"/>
  <col min="16" max="19" width="18" customWidth="1"/>
</cols>
"@

    $freeze = if ($FrozenRows -gt 0) {
        "<sheetViews><sheetView workbookViewId=`"0`"><pane ySplit=`"$FrozenRows`" topLeftCell=`"A$($FrozenRows + 1)`" activePane=`"bottomLeft`" state=`"frozen`"/></sheetView></sheetViews>"
    } else {
        "<sheetViews><sheetView workbookViewId=`"0`"/></sheetViews>"
    }

    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  $freeze
  $cols
  <sheetData>
    $($sheetData -join "`n    ")
  </sheetData>
  <autoFilter ref="A1:S1"/>
</worksheet>
"@
}

function AddZipEntry([System.IO.Compression.ZipArchive]$Zip, [string]$Name, [string]$Content) {
    $entry = $Zip.CreateEntry($Name)
    $stream = $entry.Open()
    $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
    $writer.Write($Content)
    $writer.Dispose()
    $stream.Dispose()
}

$headers = @(
    "作業日",
    "予定",
    "一次会社",
    "職種",
    "一次会社人数",
    "二次会社",
    "二次会社人数",
    "作業エリア",
    "作業内容",
    "来場予定日",
    "来場予定一次会社人数",
    "来場予定二次会社",
    "来場予定二次会社人数",
    "来場予定作業エリア",
    "来場予定作業内容",
    "登録日時",
    "更新日時",
    "取込日時",
    "取込元ファイル"
)

function PadRow([object[]]$Values) {
  $cells = New-Object 'System.Collections.Generic.List[object]'
  foreach ($value in $Values) {
    [void]$cells.Add($value)
  }
  while ($cells.Count -lt $headers.Count) {
    [void]$cells.Add("")
  }
  return [object[]]$cells.ToArray()
}

$usageRows = New-Object 'System.Collections.Generic.List[object[]]'
$usageRows.Add((PadRow @("作業予定マスタExcel")))
$usageRows.Add((PadRow @("使い方")))
$usageRows.Add((PadRow @("1", "このファイルをExcelで開き、名前を付けて保存で .xlsm として保存します。")))
$usageRows.Add((PadRow @("2", "vba/ImportSchedules.bas を標準モジュールに取り込みます。")))
$usageRows.Add((PadRow @("3", "Webアプリから作業予定Excelをダウンロードします。")))
$usageRows.Add((PadRow @("4", "マクロ「作業予定を取り込む」を実行して、ダウンロードしたファイルを選択します。")))
$usageRows.Add((PadRow @("5", "日付別シートと取込一覧に、重複を上書きしながら追加されます。")))
$usageRows.Add((PadRow @("")))
$usageRows.Add((PadRow @("重複判定キー", "作業日 + 予定 + 一次会社 + 二次会社 + 来場予定二次会社")))

$allRows = New-Object 'System.Collections.Generic.List[object[]]'
$allRows.Add([object[]]$headers)

$templateRows = New-Object 'System.Collections.Generic.List[object[]]'
$templateRows.Add([object[]]$headers)
$templateRows.Add([object[]]@("2026-09-04", "作業あり", "○○設備", "配管工", "3", "△△工業", "2", "10F", "配管施工", "", "", "", "", "", "", "2026-09-03 18:00", "2026-09-03 18:00", "", ""))
$templateRows.Add([object[]]@("2026-09-04", "作業あり", "○○設備", "配管工", "3", "□□工業", "4", "10F", "配管施工", "", "", "", "", "", "", "2026-09-03 18:00", "2026-09-03 18:00", "", ""))
$templateRows.Add([object[]]@("2026-09-05", "作業なし", "○○設備", "配管工", "", "", "", "", "", "2026-09-08", "3", "△△工業", "2", "11F", "配管施工", "2026-09-03 18:00", "2026-09-03 18:00", "", ""))

$outputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$outputDir = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Force
}

$fs = [System.IO.File]::Open($outputFullPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    AddZipEntry $zip "[Content_Types].xml" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
"@

    AddZipEntry $zip "_rels/.rels" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

    AddZipEntry $zip "docProps/app.xml" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ktnk</Application>
</Properties>
"@

    $created = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    AddZipEntry $zip "docProps/core.xml" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>作業予定マスタ</dc:title>
  <dc:creator>ktnk</dc:creator>
  <cp:lastModifiedBy>ktnk</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$created</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$created</dcterms:modified>
</cp:coreProperties>
"@

    AddZipEntry $zip "xl/workbook.xml" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="使い方" sheetId="1" r:id="rId1"/>
    <sheet name="取込一覧" sheetId="2" r:id="rId2"/>
    <sheet name="出力サンプル" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>
"@

    AddZipEntry $zip "xl/_rels/workbook.xml.rels" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"@

    AddZipEntry $zip "xl/styles.xml" @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Yu Gothic"/></font>
    <font><b/><sz val="14"/><name val="Yu Gothic"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Yu Gothic"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
"@

    AddZipEntry $zip "xl/worksheets/sheet1.xml" (WorksheetXml $usageRows 0)
    AddZipEntry $zip "xl/worksheets/sheet2.xml" (WorksheetXml $allRows 1)
    AddZipEntry $zip "xl/worksheets/sheet3.xml" (WorksheetXml $templateRows 1)
}
finally {
    $zip.Dispose()
    $fs.Dispose()
}

Write-Output $outputFullPath
