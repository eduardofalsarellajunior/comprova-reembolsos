"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type Expense = {
  id: string;
  sourceFile: string;
  supplier: string;
  date: string;
  amount: number | null;
  currency: string;
  category: string;
  description: string;
  confidence: "alta" | "media" | "baixa";
  notes: string;
};

type PendingFile = { id: string; file: File; status: "pronto" | "lendo" | "concluido" | "erro"; error?: string };

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const categories = ["Alimentação", "Hospedagem", "Transporte", "Combustível", "Pedágio", "Estacionamento", "Material", "Outros"];

function money(value: number | null, currency: string) {
  if (value === null) return "";
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value); }
  catch { return value.toFixed(2).replace(".", ","); }
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");

  const total = useMemo(() => expenses.reduce((sum, row) => sum + (row.amount || 0), 0), [expenses]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => acceptedTypes.includes(file.type) && file.size <= 20 * 1024 * 1024);
    const invalidCount = incoming.length - valid.length;
    setFiles((current) => [...current, ...valid.map((file) => ({ id: crypto.randomUUID(), file, status: "pronto" as const }))]);
    if (invalidCount) setNotice(`${invalidCount} arquivo(s) ignorado(s). Use JPG, PNG, WEBP ou PDF de até 20 MB.`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function analyze() {
    const queue = files.filter((item) => item.status === "pronto" || item.status === "erro");
    if (!queue.length) return;
    setProcessing(true);
    setNotice("");

    for (const item of queue) {
      setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "lendo", error: undefined } : entry));
      try {
        const body = new FormData();
        body.append("file", item.file);
        const response = await fetch("/api/analyze", { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível ler este arquivo.");
        const rows: Expense[] = payload.expenses.map((expense: Omit<Expense, "id" | "sourceFile">) => ({
          ...expense,
          id: crypto.randomUUID(),
          sourceFile: item.file.name,
        }));
        setExpenses((current) => [...current, ...rows]);
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "concluido" } : entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro inesperado.";
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "erro", error: message } : entry));
      }
    }
    setProcessing(false);
  }

  function updateExpense(id: string, field: keyof Expense, value: string) {
    setExpenses((current) => current.map((row) => row.id === id ? {
      ...row,
      [field]: field === "amount" ? (value === "" ? null : Number(value.replace(",", "."))) : value,
    } : row));
  }

  function copyTable() {
    const headers = ["Arquivo", "Fornecedor", "Data", "Valor", "Moeda", "Categoria", "Descrição", "Confiança", "Observações"];
    const rows = expenses.map((row) => [row.sourceFile, row.supplier, row.date, row.amount?.toFixed(2).replace(".", ",") || "", row.currency, row.category, row.description, row.confidence, row.notes]);
    navigator.clipboard.writeText([headers, ...rows].map((row) => row.join("\t")).join("\n"));
    setNotice("Tabela copiada. Agora é só colar no Excel ou em outro sistema.");
  }

  function exportCsv() {
    const rows = [
      ["Arquivo", "Fornecedor", "Data", "Valor", "Moeda", "Categoria", "Descrição", "Confiança", "Observações"],
      ...expenses.map((row) => [row.sourceFile, row.supplier, row.date, row.amount?.toFixed(2) || "", row.currency, row.category, row.description, row.confidence, row.notes]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reembolsos-${new Date().toLocaleDateString("pt-BR").replaceAll("/", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Comprova início">
          <span className="brandMark">C</span><span>comprova</span>
        </a>
        <span className="privacy"><span className="privacyDot" /> Seus arquivos não ficam armazenados</span>
      </header>

      <section className="hero" id="inicio">
        <div className="eyebrow">Leitura inteligente de comprovantes</div>
        <h1>De comprovantes<br />para uma tabela, <em>em minutos.</em></h1>
        <p>Envie fotos, prints e PDFs de uma só vez. A IA organiza cada despesa para você revisar, copiar e seguir com seu reembolso.</p>
      </section>

      <section className="workspace" aria-label="Importação de comprovantes">
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
        >
          <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} />
          <div className="uploadIcon">↑</div>
          <h2>Solte seus comprovantes aqui</h2>
          <p>ou <span>escolha os arquivos</span> no seu computador</p>
          <small>JPG, PNG, WEBP ou PDF · até 20 MB por arquivo</small>
        </div>

        {files.length > 0 && (
          <div className="filePanel">
            <div className="filePanelHeader"><strong>{files.length} arquivo(s) no lote</strong><button onClick={() => setFiles([])} disabled={processing}>Limpar lote</button></div>
            <div className="fileList">
              {files.map((item) => (
                <div className="fileItem" key={item.id}>
                  <span className={`fileType ${item.file.type === "application/pdf" ? "pdf" : "image"}`}>{item.file.type === "application/pdf" ? "PDF" : "IMG"}</span>
                  <span className="fileName"><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB{item.error ? ` · ${item.error}` : ""}</small></span>
                  <span className={`status ${item.status}`}>{item.status === "lendo" ? "Lendo…" : item.status === "concluido" ? "Pronto" : item.status === "erro" ? "Tentar novamente" : "Na fila"}</span>
                </div>
              ))}
            </div>
            <button className="primary" onClick={analyze} disabled={processing}>{processing ? "Analisando o lote…" : "Ler comprovantes"}<span>→</span></button>
          </div>
        )}
      </section>

      {notice && <div className="notice" role="status">{notice}</div>}

      {expenses.length > 0 && (
        <section className="results">
          <div className="resultsHeader">
            <div><span className="sectionNumber">02</span><h2>Confira antes de copiar</h2><p>Todos os campos podem ser corrigidos.</p></div>
            <div className="actions"><button onClick={copyTable}>Copiar tabela</button><button className="dark" onClick={exportCsv}>Baixar Excel (CSV)</button></div>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Arquivo</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Categoria</th><th>Descrição</th><th>Leitura</th><th aria-label="Excluir" /></tr></thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id} className={row.confidence === "baixa" ? "needsReview" : ""}>
                    <td className="source" title={row.sourceFile}>{row.sourceFile}</td>
                    <td><input value={row.supplier} onChange={(e) => updateExpense(row.id, "supplier", e.target.value)} /></td>
                    <td><input type="date" value={row.date} onChange={(e) => updateExpense(row.id, "date", e.target.value)} /></td>
                    <td><div className="moneyInput"><span>{row.currency === "BRL" ? "R$" : row.currency}</span><input inputMode="decimal" value={row.amount ?? ""} onChange={(e) => updateExpense(row.id, "amount", e.target.value)} /></div></td>
                    <td><select value={row.category} onChange={(e) => updateExpense(row.id, "category", e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></td>
                    <td><input value={row.description} onChange={(e) => updateExpense(row.id, "description", e.target.value)} /></td>
                    <td><span className={`confidence ${row.confidence}`}>{row.confidence === "alta" ? "Alta" : row.confidence === "media" ? "Revisar" : "Baixa"}</span></td>
                    <td><button className="delete" onClick={() => setExpenses((current) => current.filter((item) => item.id !== row.id))} aria-label={`Excluir ${row.sourceFile}`}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>{expenses.length} despesa(s)</td><td>{money(total, "BRL")}</td><td colSpan={4} /></tr></tfoot>
            </table>
          </div>
          <p className="hint"><span>!</span> Linhas destacadas merecem conferência. A IA pode confundir subtotal, data de emissão ou comprovantes com pouca nitidez.</p>
        </section>
      )}

      <footer><span>Comprova</span><p>Organize. Confira. Reembolse.</p></footer>
    </main>
  );
}
