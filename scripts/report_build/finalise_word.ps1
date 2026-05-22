# Open a generated DOCX in Microsoft Word, update the table of contents and all fields,
# save it as the final DOCX, and export a PDF from the same Word document.
# Usage: ./finalise_word.ps1 -InDocx <draft.docx> -OutDocx <final.docx> -OutPdf <final.pdf>
param(
    [Parameter(Mandatory = $true)][string]$InDocx,
    [Parameter(Mandatory = $true)][string]$OutDocx,
    [Parameter(Mandatory = $true)][string]$OutPdf
)
$ErrorActionPreference = 'Stop'
$in = (Resolve-Path $InDocx).Path
$outDocx = [System.IO.Path]::GetFullPath($OutDocx)
$outPdf = [System.IO.Path]::GetFullPath($OutPdf)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($in, $false, $false, $false)
    # Two passes: the TOC's own length can move later headings to another page.
    for ($pass = 0; $pass -lt 2; $pass++) {
        foreach ($toc in $doc.TablesOfContents) {
            $toc.Update()
            # Word writes theme-font (Calibri) runs into regenerated TOC entries; keep them Arial.
            $toc.Range.Font.Name = 'Arial'
        }
        $doc.Repaginate()
    }
    $pages = $doc.ComputeStatistics(2)   # wdStatisticPages
    $doc.SaveAs2($outDocx, 16)            # wdFormatDocumentDefault (.docx)
    # wdExportFormatPDF = 17, wdExportOptimizeForPrint = 0, wdExportAllDocument = 0,
    # wdExportDocumentContent = 0, wdExportCreateHeadingBookmarks = 1
    $doc.ExportAsFixedFormat($outPdf, 17, $false, 0, 0, 1, 1, 0, $true, $true, 1, $true, $true, $false)
    Write-Output "pages=$pages docx=$outDocx pdf=$outPdf"
    # On this host Word sometimes drops the COM connection while closing after an export.
    # Both files are already written at that point, so close/quit failures are ignored.
    try { $doc.Close($false) } catch { Write-Output "note: Word disconnected on close (outputs already written)" }
}
finally {
    try { $word.Quit() } catch { }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { }
}
