import * as XLSX from 'xlsx';
import { parseCompanyWorkbook } from './lib/companies.ts';

const rows = [
  { '一次会社': 'A社', '二次会社': 'B社' },
  { '一次会社': 'A社', '二次会社': 'C社' },
  { '一次会社': 'D社', '二次会社': '' },
];

const sheet = XLSX.utils.json_to_sheet(rows);
const parsed = parseCompanyWorkbook(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
console.log(JSON.stringify({
  primaryCompanies: parsed.primaryCompanies,
  secondariesByPrimary: parsed.secondariesByPrimary,
}));
