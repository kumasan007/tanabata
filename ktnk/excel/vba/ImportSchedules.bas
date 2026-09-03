Attribute VB_Name = "ImportSchedules"
Option Explicit

Private Const HEADER_ROW As Long = 1
Private Const FIRST_DATA_ROW As Long = 2
Private Const FIRST_COL As Long = 1
Private Const LAST_SOURCE_COL As Long = 15
Private Const IMPORTED_AT_COL As Long = 16
Private Const SOURCE_FILE_COL As Long = 17

Private headers As Variant

Public Sub 作業予定を取り込む()
    Dim selectedPath As String
    selectedPath = PickImportFile()
    If Len(selectedPath) = 0 Then Exit Sub

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    On Error GoTo Fail

    InitHeaders
    EnsureBaseSheets ThisWorkbook

    Dim sourceBook As Workbook
    Set sourceBook = Workbooks.Open(Filename:=selectedPath, ReadOnly:=True)

    Dim ws As Worksheet
    For Each ws In sourceBook.Worksheets
        ImportWorksheet ws, ThisWorkbook, selectedPath
    Next ws

    sourceBook.Close SaveChanges:=False

    Application.DisplayAlerts = True
    Application.ScreenUpdating = True

    MsgBox "作業予定の取込が完了しました。", vbInformation
    Exit Sub

Fail:
    On Error Resume Next
    If Not sourceBook Is Nothing Then sourceBook.Close SaveChanges:=False
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox "取込に失敗しました。" & vbCrLf & Err.Description, vbExclamation
End Sub

Private Function PickImportFile() As String
    Dim dialog As FileDialog
    Set dialog = Application.FileDialog(msoFileDialogFilePicker)

    With dialog
        .Title = "Webアプリからダウンロードした作業予定ファイルを選択してください"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "作業予定ファイル", "*.xlsx;*.xlsm;*.xls;*.csv"
        .Filters.Add "すべてのファイル", "*.*"

        If .Show <> -1 Then
            PickImportFile = ""
        Else
            PickImportFile = .SelectedItems(1)
        End If
    End With
End Function

Private Sub InitHeaders()
    headers = Array( _
        "作業日", _
        "予定", _
        "一次会社", _
        "一次会社人数", _
        "二次会社", _
        "二次会社人数", _
        "作業エリア", _
        "作業内容", _
        "次回来場予定日", _
        "次回一次会社人数", _
        "次回二次会社", _
        "次回二次会社人数", _
        "次回作業内容", _
        "登録日時", _
        "更新日時", _
        "取込日時", _
        "取込元ファイル" _
    )
End Sub

Private Sub EnsureBaseSheets(ByVal book As Workbook)
    EnsureSheet book, "取込一覧"
    SetupHeader book.Worksheets("取込一覧")
End Sub

Private Sub ImportWorksheet(ByVal sourceWs As Worksheet, ByVal targetBook As Workbook, ByVal sourcePath As String)
    If Not LooksLikeScheduleSheet(sourceWs) Then Exit Sub

    Dim lastRow As Long
    lastRow = sourceWs.Cells(sourceWs.Rows.Count, FIRST_COL).End(xlUp).Row
    If lastRow < FIRST_DATA_ROW Then Exit Sub

    Dim r As Long
    For r = FIRST_DATA_ROW To lastRow
        If Len(Trim(CStr(sourceWs.Cells(r, 1).Value))) > 0 Then
            ImportOneRow sourceWs, r, targetBook, sourcePath
        End If
    Next r
End Sub

Private Function LooksLikeScheduleSheet(ByVal ws As Worksheet) As Boolean
    LooksLikeScheduleSheet = _
        CStr(ws.Cells(HEADER_ROW, 1).Value) = "作業日" And _
        CStr(ws.Cells(HEADER_ROW, 2).Value) = "予定" And _
        CStr(ws.Cells(HEADER_ROW, 3).Value) = "一次会社"
End Function

Private Sub ImportOneRow(ByVal sourceWs As Worksheet, ByVal sourceRow As Long, ByVal targetBook As Workbook, ByVal sourcePath As String)
    Dim workDateValue As Variant
    workDateValue = sourceWs.Cells(sourceRow, 1).Value

    Dim sheetName As String
    sheetName = DateSheetName(workDateValue)

    Dim dateWs As Worksheet
    Set dateWs = EnsureSheet(targetBook, sheetName)
    SetupHeader dateWs

    UpsertRow dateWs, sourceWs, sourceRow, sourcePath
    UpsertRow targetBook.Worksheets("取込一覧"), sourceWs, sourceRow, sourcePath
End Sub

Private Function EnsureSheet(ByVal book As Workbook, ByVal sheetName As String) As Worksheet
    On Error Resume Next
    Set EnsureSheet = book.Worksheets(sheetName)
    On Error GoTo 0

    If EnsureSheet Is Nothing Then
        Set EnsureSheet = book.Worksheets.Add(After:=book.Worksheets(book.Worksheets.Count))
        EnsureSheet.Name = sheetName
    End If
End Function

Private Sub SetupHeader(ByVal ws As Worksheet)
    Dim c As Long
    For c = LBound(headers) To UBound(headers)
        ws.Cells(HEADER_ROW, c + 1).Value = headers(c)
    Next c

    With ws.Range(ws.Cells(HEADER_ROW, 1), ws.Cells(HEADER_ROW, UBound(headers) + 1))
        .Font.Bold = True
        .Interior.Color = RGB(31, 78, 121)
        .Font.Color = RGB(255, 255, 255)
        .HorizontalAlignment = xlCenter
    End With

    ws.Columns("A:Q").EntireColumn.AutoFit
    If Not ws.AutoFilterMode Then
        ws.Range("A1:Q1").AutoFilter
    End If
End Sub

Private Sub UpsertRow(ByVal targetWs As Worksheet, ByVal sourceWs As Worksheet, ByVal sourceRow As Long, ByVal sourcePath As String)
    Dim key As String
    key = BuildKeyFromSheet(sourceWs, sourceRow)

    Dim targetRow As Long
    targetRow = FindRowByKey(targetWs, key)
    If targetRow = 0 Then
        targetRow = targetWs.Cells(targetWs.Rows.Count, FIRST_COL).End(xlUp).Row + 1
        If targetRow < FIRST_DATA_ROW Then targetRow = FIRST_DATA_ROW
    End If

    Dim c As Long
    For c = FIRST_COL To LAST_SOURCE_COL
        targetWs.Cells(targetRow, c).Value = sourceWs.Cells(sourceRow, c).Value
    Next c

    targetWs.Cells(targetRow, IMPORTED_AT_COL).Value = Now
    targetWs.Cells(targetRow, SOURCE_FILE_COL).Value = Dir(sourcePath)

    targetWs.Columns("A:Q").EntireColumn.AutoFit
End Sub

Private Function FindRowByKey(ByVal ws As Worksheet, ByVal key As String) As Long
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, FIRST_COL).End(xlUp).Row
    If lastRow < FIRST_DATA_ROW Then
        FindRowByKey = 0
        Exit Function
    End If

    Dim r As Long
    For r = FIRST_DATA_ROW To lastRow
        If BuildKeyFromSheet(ws, r) = key Then
            FindRowByKey = r
            Exit Function
        End If
    Next r

    FindRowByKey = 0
End Function

Private Function BuildKeyFromSheet(ByVal ws As Worksheet, ByVal rowNumber As Long) As String
    BuildKeyFromSheet = _
        NormalizeKeyPart(ws.Cells(rowNumber, 1).Value) & "|" & _
        NormalizeKeyPart(ws.Cells(rowNumber, 2).Value) & "|" & _
        NormalizeKeyPart(ws.Cells(rowNumber, 3).Value) & "|" & _
        NormalizeKeyPart(ws.Cells(rowNumber, 5).Value) & "|" & _
        NormalizeKeyPart(ws.Cells(rowNumber, 11).Value)
End Function

Private Function NormalizeKeyPart(ByVal value As Variant) As String
    If IsDate(value) Then
        NormalizeKeyPart = Format(CDate(value), "yyyy-mm-dd")
    Else
        NormalizeKeyPart = Trim(CStr(value))
    End If
End Function

Private Function DateSheetName(ByVal value As Variant) As String
    If IsDate(value) Then
        DateSheetName = Format(CDate(value), "yyyy-mm-dd")
    Else
        DateSheetName = Left(CleanSheetName(CStr(value)), 31)
        If Len(DateSheetName) = 0 Then DateSheetName = "日付未設定"
    End If
End Function

Private Function CleanSheetName(ByVal value As String) As String
    Dim invalidChars As Variant
    invalidChars = Array("\", "/", "?", "*", "[", "]", ":")

    Dim result As String
    result = value

    Dim i As Long
    For i = LBound(invalidChars) To UBound(invalidChars)
        result = Replace(result, invalidChars(i), "_")
    Next i

    CleanSheetName = result
End Function
