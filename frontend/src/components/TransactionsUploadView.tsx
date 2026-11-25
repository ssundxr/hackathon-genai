import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatCategoryLabel, formatMoney, formatSourceLabel } from '../format';
import {
  CurrencyCode,
  ExcelColumnMap,
  LedgerItem,
  SavedExcelMapping,
  UploadedFileRecord,
  UserProfile,
} from '../types';

interface Props {
  month: string;
  availableMonths: string[];
  profile: UserProfile;
  excelMapping: SavedExcelMapping | null;
  uploadedFiles: UploadedFileRecord[];
  ledger: LedgerItem[];
  onChangeMonth: (m: string) => void;
  onCarryForwardMonth: (sourceMonth: string, targetMonth: string) => Promise<void>;
  onSaveProfile: (profile: Partial<UserProfile>) => Promise<void>;
  onIngestCsv: (csvText: string, filename?: string) => Promise<void>;
  onIngestExcel: (payload: {
    rows: Array<Record<string, unknown>>;
    column_map: ExcelColumnMap;
    sheet_name: string;
    filename: string;
    save_mapping: boolean;
  }) => Promise<void>;
  onUpsertLedgerItem: (item: Partial<LedgerItem>) => Promise<void>;
  onDeleteLedgerItem: (txId: string) => Promise<void>;
}

const CATEGORIES = [
  'housing',
  'groceries',
  'utilities',
  'transportation',
  'healthcare',
  'insurance',
  'education',
  'minimum_debt',
  'dining',
  'subscriptions',
  'shopping',
  'travel',
  'investments',
  'emergency_fund',
  'other_discretionary',
];

const NEEDS_SET = new Set([
  'housing',
  'groceries',
  'utilities',
  'transportation',
  'healthcare',
  'insurance',
  'education',
  'minimum_debt',
]);

const SAVINGS_SET = new Set(['investments', 'emergency_fund', 'savings', 'sip', 'retirement']);

const SAMPLE_BANK_CSV = `Date,Narration,Debit,Credit
2026-11-01,TechCorp India Salary NEFT,,75000
2026-11-02,HSR Layout Apartment Rent,22000,
2026-11-04,BESCOM Electricity & Airtel Fiber,3100,
2026-11-07,Zepto & DMart Groceries,7800,
2026-11-14,Swiggy & Dining Out,10200,
2026-11-19,Flipkart Festive Order,6400,
2026-11-25,Nifty 50 Mutual Fund SIP,8500,`;

function getNextMonthString(current: string): string {
  const parts = current.split('-');
  if (parts.length !== 2) return '2026-12';
  let y = Number(parts[0]);
  let m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '2026-12';
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function previewCategoryAndBucket(name: string, explicitCat: string): { category: string; bucket: string } {
  const txt = `${name} ${explicitCat}`.toLowerCase();
  if (/rent|housing|society/.test(txt)) return { category: 'housing', bucket: 'needs' };
  if (/grocer|milk|vegetable|zepto|bigbasket|blinkit|dmart/.test(txt)) return { category: 'groceries', bucket: 'needs' };
  if (/electric|airtel|jio|internet|utility|water/.test(txt)) return { category: 'utilities', bucket: 'needs' };
  if (/uber|ola|metro|petrol|fuel|rapido|commute/.test(txt)) return { category: 'transportation', bucket: 'needs' };
  if (/swiggy|zomato|coffee|dining|restaurant|movie/.test(txt)) return { category: 'dining', bucket: 'wants' };
  if (/netflix|spotify|gym|ott|subscription|adobe/.test(txt)) return { category: 'subscriptions', bucket: 'wants' };
  if (/sip|ppf|nps|mutual|emergency|savings|zerodha|groww/.test(txt)) return { category: 'investments', bucket: 'savings' };
  if (explicitCat) {
    const clean = explicitCat.trim().toLowerCase().replace(/\s+/g, '_');
    if (NEEDS_SET.has(clean)) return { category: clean, bucket: 'needs' };
    if (SAVINGS_SET.has(clean)) return { category: clean, bucket: 'savings' };
    return { category: clean, bucket: 'wants' };
  }
  return { category: 'other_discretionary', bucket: 'wants' };
}

export const TransactionsUploadView: React.FC<Props> = ({
  month,
  availableMonths,
  profile,
  excelMapping,
  uploadedFiles,
  ledger,
  onChangeMonth,
  onCarryForwardMonth,
  onSaveProfile,
  onIngestCsv,
  onIngestExcel,
  onUpsertLedgerItem,
  onDeleteLedgerItem,
}) => {
  const currency: CurrencyCode = profile.currency || 'INR';
  const [preferredMode, setPreferredMode] = useState<'portal' | 'excel'>(profile.preferred_input_mode);
  const [csvText, setCsvText] = useState('');
  const [csvFilename, setCsvFilename] = useState('');
  const [busy, setBusy] = useState(false);

  // Month continuity controls
  const [nextMonthInput, setNextMonthInput] = useState(() => getNextMonthString(month));
  const [showNextMonthBox, setShowNextMonthBox] = useState(false);

  // Extracted Data Viewer Modal
  const [inspectFile, setInspectFile] = useState<UploadedFileRecord | null>(null);
  const [inspectSearch, setInspectSearch] = useState('');

  const csvInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [excelFilename, setExcelFilename] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<Array<Record<string, unknown>>>([]);
  const [colMap, setColMap] = useState<ExcelColumnMap>(
    excelMapping?.column_map || { name: '', amount: '', category: '', date: '', type: '', recurring: '' }
  );
  const [saveMapping, setSaveMapping] = useState(true);

  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemCat, setNewItemCat] = useState('groceries');
  const [newItemType, setNewItemType] = useState<'expense' | 'income'>('expense');
  const [newItemRecurring, setNewItemRecurring] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'bank_csv' | 'excel_import' | 'portal_entry'>('all');

  const autoGuessMapping = (headers: string[]): ExcelColumnMap => {
    const findCol = (patterns: RegExp[]) =>
      headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) || '';
    if (
      excelMapping?.column_map &&
      headers.includes(excelMapping.column_map.name) &&
      headers.includes(excelMapping.column_map.amount)
    ) {
      return excelMapping.column_map;
    }
    return {
      name: findCol([/particular/, /description/, /item/, /merchant/, /expense/, /name/, /title/]),
      amount: findCol([/amount/, /spent/, /cost/, /value/, /price/, /debit/, /inr/, /rs/]),
      category: findCol([/category/, /group/, /tag/, /bucket/]),
      date: findCol([/date/, /when/, /day/, /month/]),
      type: findCol([/type/, /flow/, /dr/]),
      recurring: findCol([/recurr/, /fixed/, /monthly/]),
    };
  };

  const loadSheetData = (wb: XLSX.WorkBook, sheet: string) => {
    setSelectedSheet(sheet);
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    setExcelRows(rows);
    const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
    setExcelHeaders(hdrs);
    setColMap(autoGuessMapping(hdrs));
  };

  const processExcelFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    setWorkbook(wb);
    setExcelFilename(file.name);
    setSheetNames(wb.SheetNames);
    if (wb.SheetNames.length > 0) {
      const preferredSheet =
        excelMapping?.sheet_name && wb.SheetNames.includes(excelMapping.sheet_name)
          ? excelMapping.sheet_name
          : wb.SheetNames[0];
      loadSheetData(wb, preferredSheet);
    }
  };

  const handleLoadSampleExcel = () => {
    const sampleRows = [
      { Date: `${month}-02`, Particulars: 'Society Maintenance & Cook', Category: 'housing', Amount: 5200, Type: 'expense', 'Monthly?': 'Yes' },
      { Date: `${month}-06`, Particulars: 'Local Vegetables & Milk', Category: 'groceries', Amount: 2900, Type: 'expense', 'Monthly?': 'No' },
      { Date: `${month}-12`, Particulars: 'Cult.fit & OTT Apps', Category: 'subscriptions', Amount: 2000, Type: 'expense', 'Monthly?': 'Yes' },
      { Date: `${month}-17`, Particulars: 'Weekend Coffee & Cinema', Category: 'dining', Amount: 2400, Type: 'expense', 'Monthly?': 'No' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses_2026');
    setWorkbook(wb);
    setExcelFilename('sample_personal_expenses.xlsx');
    setSheetNames(['Expenses_2026']);
    loadSheetData(wb, 'Expenses_2026');
  };

  const handleDownloadStarterTemplate = () => {
    const templateRows = [
      { Date: `${month}-02`, Particulars: 'House Maintenance', Category: 'housing', Amount: 4500, Type: 'expense', 'Monthly?': 'Yes' },
      { Date: `${month}-08`, Particulars: 'Local Vegetables & Dairy', Category: 'groceries', Amount: 2800, Type: 'expense', 'Monthly?': 'No' },
      { Date: `${month}-14`, Particulars: 'Weekend Coffee & Movies', Category: 'dining', Amount: 2200, Type: 'expense', 'Monthly?': 'No' },
      { Date: `${month}-20`, Particulars: 'PPF / Emergency Transfer', Category: 'emergency_fund', Amount: 5000, Type: 'expense', 'Monthly?': 'Yes' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses_2026');
    XLSX.writeFile(wb, 'finwise_starter_template.xlsx');
  };

  const handleExportLedgerExcel = () => {
    const rows = ledger.map((x) => ({
      Date: x.date,
      Particulars: x.name,
      Category: x.category,
      Bucket: x.bucket,
      Amount: x.amount,
      Type: x.tx_type,
      Source: formatSourceLabel(x.source),
      'Monthly?': x.recurring ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Ledger_${month}`);
    XLSX.writeFile(wb, `finwise_ledger_${month}.xlsx`);
  };

  const transformedPreview = useMemo(() => {
    if (!colMap.name || !colMap.amount || excelRows.length === 0) return [];
    return excelRows.slice(0, 4).map((row) => {
      const itemName = String(row[colMap.name] ?? '').trim();
      const rawAmt = String(row[colMap.amount] ?? '0').replace(/[^0-9.-]/g, '');
      const amount = Math.abs(Number(rawAmt) || 0);
      const explicitCat = colMap.category ? String(row[colMap.category] ?? '') : '';
      const { category, bucket } = previewCategoryAndBucket(itemName, explicitCat);
      return { itemName, amount, category, bucket };
    });
  }, [colMap, excelRows]);

  const filteredLedger = useMemo(() => {
    return ledger.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [ledger, searchQuery, sourceFilter]);

  const filteredInspectedRows = useMemo(() => {
    if (!inspectFile) return [];
    const rows = inspectFile.extracted_rows || [];
    if (!inspectSearch.trim()) return rows;
    const q = inspectSearch.toLowerCase();
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    );
  }, [inspectFile, inspectSearch]);

  const handleAddManualItem = async () => {
    const amt = Number(newItemAmount);
    if (!newItemName.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      await onUpsertLedgerItem({
        name: newItemName.trim(),
        amount: amt,
        category: newItemCat,
        tx_type: newItemType,
        recurring: newItemRecurring,
        source: 'portal_entry',
        date: `${month}-15`,
      });
      setNewItemName('');
      setNewItemAmount('');
    } finally {
      setBusy(false);
    }
  };

  const handleImportPastedRows = async () => {
    const lines = pasteBuffer.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true);
    try {
      for (const line of lines) {
        const cols = line.split(/\t|,/);
        if (cols.length < 2) continue;
        const name = cols[0].trim();
        const amt = Number(cols[1].replace(/[^0-9.-]/g, ''));
        const cat = (cols[2] || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!name || !Number.isFinite(amt) || amt <= 0) continue;
        await onUpsertLedgerItem({
          name,
          amount: amt,
          category: cat || undefined,
          tx_type: 'expense',
          source: 'portal_entry',
          date: `${month}-15`,
        });
      }
      setPasteBuffer('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Month Switcher & Continuity ("Add Next Month without re-uploading") */}
      <div className="card-linen" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="card-title" style={{ margin: 0 }}>Active Reporting Period &amp; Workflow</h2>
              <span className="pill pill-navy">{month}</span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              All prior uploaded CSVs and Excel sheets stay stored safely. Switch months or start next month with one click.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={month} onChange={(e) => onChangeMonth(e.target.value)} aria-label="Switch active month">
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() => {
                setNextMonthInput(getNextMonthString(month));
                setShowNextMonthBox(!showNextMonthBox);
              }}
            >
              <CalendarPlus size={14} /> Add Next Month
            </button>
          </div>
        </div>

        {showNextMonthBox && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid var(--border-strong)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>Target Month:</span>
              <input
                type="month"
                value={nextMonthInput}
                onChange={(e) => setNextMonthInput(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (nextMonthInput) {
                    onChangeMonth(nextMonthInput);
                    setShowNextMonthBox(false);
                  }
                }}
              >
                Open Blank Month
              </button>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                disabled={busy || !nextMonthInput}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onCarryForwardMonth(month, nextMonthInput);
                    setShowNextMonthBox(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw size={13} /> Carry Forward Recurring Bills from {month}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Preferred entry mode:
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${preferredMode === 'portal' ? 'btn-dark' : ''}`}
              onClick={async () => {
                setPreferredMode('portal');
                await onSaveProfile({ preferred_input_mode: 'portal' });
              }}
            >
              {preferredMode === 'portal' && <Check size={14} />} Use This Portal
            </button>
            <button
              className={`btn btn-sm ${preferredMode === 'excel' ? 'btn-dark' : ''}`}
              onClick={async () => {
                setPreferredMode('excel');
                await onSaveProfile({ preferred_input_mode: 'excel' });
              }}
            >
              {preferredMode === 'excel' && <Check size={14} />} Keep Uploading Excel
            </button>
          </div>
        </div>
      </div>

      {/* Stored File Vault & Extracted Data Viewer */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={17} color="#1A2B3C" /> Stored Statements &amp; Uploaded Data Vault
            </h3>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
              Uploaded CSV and Excel files are stored permanently in your workspace. Inspect extracted data anytime without re-uploading.
            </div>
          </div>
          <span className="pill pill-gold">{uploadedFiles.length} Stored File{uploadedFiles.length === 1 ? '' : 's'}</span>
        </div>

        {uploadedFiles.length === 0 ? (
          <div className="muted" style={{ padding: '14px 4px' }}>
            No files uploaded yet. Upload a Bank CSV or map an Excel sheet below to store it permanently in your vault.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Months</th>
                  <th>Extracted Rows</th>
                  <th>Total Expense</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {uploadedFiles.map((uf) => (
                  <tr key={uf.file_id}>
                    <td>
                      <strong style={{ fontWeight: 600 }}>{uf.filename}</strong>
                      {uf.sheet_name && (
                        <div className="muted" style={{ fontSize: '0.72rem' }}>Sheet: {uf.sheet_name}</div>
                      )}
                    </td>
                    <td>
                      <span className="pill">
                        {uf.file_type === 'bank_csv' ? 'Bank CSV' : 'Excel Mapped'}
                      </span>
                    </td>
                    <td className="tabular">{(uf.months_covered || []).join(', ') || month}</td>
                    <td className="tabular">{uf.row_count} rows</td>
                    <td className="tabular" style={{ fontWeight: 600 }}>
                      {formatMoney(uf.total_expense, currency)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-soft"
                        onClick={() => {
                          setInspectFile(uf);
                          setInspectSearch('');
                        }}
                      >
                        <Eye size={13} /> View Extracted Data
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dual Upload Cards */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={17} color="#1A2B3C" /> Bank Statement CSV
            </h3>
            <button
              className="btn btn-sm"
              onClick={() => {
                setCsvText(SAMPLE_BANK_CSV);
                setCsvFilename(`sample_bank_${month}.csv`);
              }}
            >
              Use Sample CSV
            </button>
          </div>

          <div
            className="dropzone"
            style={{ marginBottom: 12 }}
            onClick={() => csvInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setCsvText(await f.text());
                setCsvFilename(f.name);
              }
            }}
          >
            <Upload size={19} color="#1A2B3C" />
            <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
              {csvFilename ? `Selected: ${csvFilename}` : 'Drop bank .csv file here or click to choose'}
            </div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Works with Date, Narration/Description, Debit &amp; Credit columns
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCsvText(await f.text());
                  setCsvFilename(f.name);
                }
              }}
            />
          </div>

          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Or paste bank statement CSV rows here..."
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', marginBottom: 10 }}
          />
          <button
            className="btn btn-dark"
            disabled={busy || !csvText.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onIngestCsv(csvText, csvFilename || `bank_statement_${month}.csv`);
                setCsvText('');
                setCsvFilename('');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Upload size={15} /> Import &amp; Store CSV
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={17} color="#1A2B3C" /> Excel Sheet Mapper
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm" onClick={handleLoadSampleExcel}>
                Try Sample Excel
              </button>
              <button className="btn btn-sm" onClick={handleDownloadStarterTemplate}>
                <Download size={13} /> Template
              </button>
            </div>
          </div>

          {excelMapping && (
            <div className="pill pill-gold" style={{ marginBottom: 12, width: '100%', justifyContent: 'flex-start', borderRadius: 10, padding: '7px 10px' }}>
              Saved schema active: {excelMapping.column_map.name} &amp; {excelMapping.column_map.amount} ({excelMapping.filename})
            </div>
          )}

          <div
            className="dropzone"
            style={{ marginBottom: 12 }}
            onClick={() => excelInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) await processExcelFile(f);
            }}
          >
            <FileSpreadsheet size={19} color="#1A2B3C" />
            <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
              {excelFilename ? `Loaded: ${excelFilename}` : 'Drop your .xlsx or .xls file here or click'}
            </div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Map columns once — future uploads auto-map and save straight to your dashboard
            </div>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await processExcelFile(f);
              }}
            />
          </div>

          {workbook && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="muted">Sheet tab:</span>
                <select value={selectedSheet} onChange={(e) => loadSheetData(workbook, e.target.value)}>
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="pill">{excelRows.length} rows</span>
              </div>

              <div className="grid-2" style={{ gap: 8 }}>
                <div>
                  <label className="muted" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>Item name column *</label>
                  <select style={{ width: '100%' }} value={colMap.name} onChange={(e) => setColMap({ ...colMap, name: e.target.value })}>
                    <option value="">Select column</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>Amount column *</label>
                  <select style={{ width: '100%' }} value={colMap.amount} onChange={(e) => setColMap({ ...colMap, amount: e.target.value })}>
                    <option value="">Select column</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>Category column</label>
                  <select style={{ width: '100%' }} value={colMap.category || ''} onChange={(e) => setColMap({ ...colMap, category: e.target.value })}>
                    <option value="">Auto-detect</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>Date column</label>
                  <select style={{ width: '100%' }} value={colMap.date || ''} onChange={(e) => setColMap({ ...colMap, date: e.target.value })}>
                    <option value="">Use {month}</option>
                    {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {transformedPreview.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    Extraction Preview <ArrowRight size={12} /> FinWise Columns
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Category</th>
                          <th>Bucket</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transformedPreview.map((r, idx) => (
                          <tr key={idx}>
                            <td>{r.itemName}</td>
                            <td>{formatCategoryLabel(r.category)}</td>
                            <td><span className="pill">{r.bucket}</span></td>
                            <td className="tabular" style={{ fontWeight: 600 }}>{formatMoney(r.amount, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <input type="checkbox" checked={saveMapping} onChange={(e) => setSaveMapping(e.target.checked)} />
                Save column mapping so next month&apos;s Excel imports in one click
              </label>

              <button
                className="btn btn-dark"
                disabled={busy || !colMap.name || !colMap.amount}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onIngestExcel({
                      rows: excelRows,
                      column_map: colMap,
                      sheet_name: selectedSheet,
                      filename: excelFilename,
                      save_mapping: saveMapping,
                    });
                    setWorkbook(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Upload size={15} /> Store &amp; Sync to Real-Time Dashboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Designated Portal Transaction Ledger */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <h3 className="card-title">Unified Real-Time Ledger ({month})</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, color: '#52555A' }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                style={{ paddingLeft: 30, width: 175 }}
              />
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}>
              <option value="all">All sources</option>
              <option value="bank_csv">Bank CSV</option>
              <option value="excel_import">Excel Import</option>
              <option value="portal_entry">Added in Portal</option>
            </select>
            <button className="btn btn-sm" onClick={handleExportLedgerExcel}>
              <Download size={14} /> Export .xlsx
            </button>
          </div>
        </div>

        {/* Quick Add */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input
            placeholder="Add expense or income (e.g. Groceries, Rent)"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            style={{ flex: '2 1 180px' }}
          />
          <input
            type="number"
            placeholder={`Amount (${currency})`}
            value={newItemAmount}
            onChange={(e) => setNewItemAmount(e.target.value)}
            style={{ flex: '1 1 110px' }}
          />
          <select value={newItemCat} onChange={(e) => setNewItemCat(e.target.value)} style={{ flex: '1 1 130px' }}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{formatCategoryLabel(c)}</option>
            ))}
          </select>
          <select value={newItemType} onChange={(e) => setNewItemType(e.target.value as 'expense' | 'income')} style={{ flex: '0 1 105px' }}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newItemRecurring} onChange={(e) => setNewItemRecurring(e.target.checked)} />
            Monthly
          </label>
          <button className="btn btn-dark btn-sm" disabled={busy} onClick={handleAddManualItem}>
            <Plus size={14} /> Add
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
            placeholder="Or copy rows from Excel and paste here: Name [Tab] Amount [Tab] Category"
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm" disabled={busy || !pasteBuffer.trim()} onClick={handleImportPastedRows}>
            Paste Rows
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Source</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>
                    No matching transactions for {month}.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((item) => (
                  <tr key={item.tx_id}>
                    <td className="tabular">{item.date}</td>
                    <td>
                      <strong style={{ fontWeight: 500 }}>{item.name}</strong>
                      {item.recurring && (
                        <span className="pill pill-gold" style={{ marginLeft: 8 }}>Monthly</span>
                      )}
                    </td>
                    <td>{formatCategoryLabel(item.category)}</td>
                    <td><span className="pill">{formatSourceLabel(item.source)}</span></td>
                    <td
                      className="tabular"
                      style={{ fontWeight: 600, color: item.tx_type === 'income' ? 'var(--positive)' : 'var(--text-primary)' }}
                    >
                      {item.tx_type === 'income' ? '+' : '-'}
                      {formatMoney(item.amount, currency)}
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => onDeleteLedgerItem(item.tx_id)} aria-label="Delete transaction">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extracted Data Inspector Modal */}
      {inspectFile && (
        <div className="chat-modal-backdrop" onClick={() => setInspectFile(null)}>
          <div className="chat-modal" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Extracted Data: {inspectFile.filename}</h3>
                  <span className="pill pill-gold">
                    {inspectFile.file_type === 'bank_csv' ? 'Bank CSV' : 'Excel Sheet'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  {inspectFile.row_count} extracted records · Months: {(inspectFile.months_covered || []).join(', ')} · Total Outflow: {formatMoney(inspectFile.total_expense, currency)}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setInspectFile(null)} aria-label="Close extracted data viewer">
                <X size={17} />
              </button>
            </div>

            {inspectFile.column_mapping && (
              <div className="card-linen" style={{ padding: '10px 14px', fontSize: '0.78rem' }}>
                <strong>Saved Schema Mapping:</strong>{' '}
                Name &rarr; <code>{inspectFile.column_mapping.name}</code> | Amount &rarr;{' '}
                <code>{inspectFile.column_mapping.amount}</code>
                {inspectFile.column_mapping.category && (
                  <> | Category &rarr; <code>{inspectFile.column_mapping.category}</code></>
                )}
                {inspectFile.column_mapping.date && (
                  <> | Date &rarr; <code>{inspectFile.column_mapping.date}</code></>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <input
                type="text"
                value={inspectSearch}
                onChange={(e) => setInspectSearch(e.target.value)}
                placeholder="Filter extracted rows by merchant or category..."
                style={{ flex: 1 }}
              />
              <span className="muted tabular">{filteredInspectedRows.length} rows shown</span>
            </div>

            <div className="table-wrap" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Month</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Bucket</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInspectedRows.map((r, idx) => (
                    <tr key={`${r.tx_id}-${idx}`}>
                      <td className="tabular">{r.date}</td>
                      <td className="tabular">{r.month}</td>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>{formatCategoryLabel(r.category)}</td>
                      <td><span className="pill">{r.bucket}</span></td>
                      <td>{r.tx_type}</td>
                      <td className="tabular" style={{ fontWeight: 600, color: r.tx_type === 'income' ? 'var(--positive)' : 'var(--text-primary)' }}>
                        {r.tx_type === 'income' ? '+' : '-'}{formatMoney(r.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
