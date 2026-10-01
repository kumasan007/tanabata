import type { NewEntrantRecord } from "./types";

export const PRIMARY_COMPANY_CHOICE = "__primary__";
export const NEW_COMPANY_CHOICE = "__new_company__";
export type EntrantDraft = {
  companyChoice: string; newCompany: string; personName: string;
  nationalityStatus: "japanese_only" | "includes_foreign" | ""; notes: string;
};
export const emptyEntrantDraft = (companyChoice = ""): EntrantDraft => ({ companyChoice, newCompany: "", personName: "", nationalityStatus: "", notes: "" });
export function entrantCompany(draft: EntrantDraft) {
  return draft.companyChoice === PRIMARY_COMPANY_CHOICE ? ""
    : draft.companyChoice === NEW_COMPANY_CHOICE ? draft.newCompany.trim() : draft.companyChoice.trim();
}
export function entrantDraftError(draft: EntrantDraft) {
  if (!draft.companyChoice || (draft.companyChoice === NEW_COMPANY_CHOICE && !entrantCompany(draft))) return "所属会社を選択または入力してください。";
  if (!draft.personName.trim()) return "氏名を入力してください。";
  if (!draft.nationalityStatus) return "日本籍か外国籍かを選択してください。";
  return "";
}
export function entrantPerson(draft: EntrantDraft, id: string) {
  return { id, secondaryCompany: entrantCompany(draft), registerSecondaryCompany: draft.companyChoice === NEW_COMPANY_CHOICE,
    personName: draft.personName.trim(), nationalityStatus: draft.nationalityStatus, notes: draft.notes.trim() };
}
export function entrantToDraft(record: NewEntrantRecord): EntrantDraft {
  return { companyChoice: record.secondary_company || PRIMARY_COMPANY_CHOICE, newCompany: "", personName: record.person_names ?? "", nationalityStatus: record.nationality_status ?? "", notes: record.notes ?? "" };
}
