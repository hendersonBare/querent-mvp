// CSV for the rep's exports (task 4.3). Pure.
//
// - RFC 4180: a field with a comma, a double quote, CR or LF (or edge spaces, which some readers
//   trim) is wrapped in double quotes, with its quotes doubled. Rows end in CRLF.
// - Formula injection (OWASP "CSV Injection"): Excel, Sheets and LibreOffice run a cell that
//   starts with = + - @ (or tab / CR, or their full-width forms) as a formula, even from a CSV.
//   Every text field that would is prefixed with an apostrophe, so it opens as the text it is.
//   Numbers are written as digits and never guarded: a number is never a formula.
// - A UTF-8 byte order mark first, or Excel on Windows reads the file as ANSI and mangles "½".

export const CSV_BOM='﻿';
export const CSV_CONTENT_TYPE='text/csv; charset=utf-8';

export type CsvValue=string|number|null|undefined;

/** Starts a formula once leading spaces are skipped: = + - @, their full-width forms, or a tab / CR. */
const FORMULA_START=/^(?:[\t\r]|[  ]*[=+\-@＝＋－＠])/;
const NEEDS_QUOTES=/[",\r\n]|^\s|\s$/;

/** `text` with an apostrophe in front when a spreadsheet would read it as a formula. */
export const guardFormula=(text:string)=>FORMULA_START.test(text)?`'${text}`:text;

/** One field: text guarded then quoted as needed; a finite number as its digits; null, undefined and NaN empty. */
export function csvCell(value:CsvValue):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number')return Number.isFinite(value)?String(value):'';
  const text=guardFormula(value);
  return NEEDS_QUOTES.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

/** The whole file: the BOM, then each row's fields joined by commas, every row ending in CRLF (an empty row is a blank line). */
export function csvDocument(rows:readonly (readonly CsvValue[])[]):string{
  return CSV_BOM+rows.map(row=>`${row.map(csvCell).join(',')}\r\n`).join('');
}
