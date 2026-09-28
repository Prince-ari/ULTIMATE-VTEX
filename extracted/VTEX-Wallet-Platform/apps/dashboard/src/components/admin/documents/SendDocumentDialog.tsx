"use client"

import * as React from "react"

import { HolderMultiPicker, type HolderChoice } from "@/components/admin/holders/HolderMultiPicker"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegModal, LegSocle } from "@/components/ui/legkit"
import { ACCEPT_ATTRIBUTE, CATEGORY_LABEL, SEND_CATEGORIES, checkUpload, formatSize, titleFromFileName, wallets as walletsLabel, type DocumentCategory } from "@/lib/documentFormat"
import { api } from "@/lib/trpc"

const MAX_TITLE = 180
const MAX_NOTE = 500

interface Uploaded { storageKey: string; fileName: string }
interface SendResult { sent: number; wallets: number; skipped: Array<{ name: string; reason: string }> }

/** Téléverse le fichier dans le stockage privé ; le serveur vérifie le type, la taille et le CONTENU réel du fichier. */
async function uploadDocument(file: File): Promise<Uploaded> {
  const form = new FormData()
  form.set("purpose", "admin-document")
  form.set("file", file)
  const response = await fetch("/api/media/upload", { method: "POST", body: form, credentials: "include" })
  const result = (await response.json().catch(() => ({}))) as Partial<Uploaded> & { error?: string }
  if (!response.ok || !result.storageKey || !result.fileName) throw new Error(result.error ?? "Téléversement impossible.")
  return { storageKey: result.storageKey, fileName: result.fileName }
}

/**
 * Envoyer un document à un ou plusieurs wallets : un fichier (PDF ou image), un titre, une catégorie, une note facultative.
 * Chaque destinataire (titulaire, ou propriétaires et administrateurs d'une entreprise) le reçoit dans « Documents » et est notifié.
 * Le serveur refuse tout wallet hors du périmètre de l'expéditeur et relit le fichier avant de le remettre.
 */
export function SendDocumentDialog({ open, onOpenChange, initialWallets = [], onSent }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWallets?: HolderChoice[]
  onSent?: (result: SendResult) => void | Promise<void>
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [uploaded, setUploaded] = React.useState<Uploaded | null>(null)
  const [title, setTitle] = React.useState("")
  const [titleTouched, setTitleTouched] = React.useState(false)
  const [category, setCategory] = React.useState<DocumentCategory>("statement")
  const [note, setNote] = React.useState("")
  const [wallets, setWallets] = React.useState<HolderChoice[]>(initialWallets)
  const [busy, setBusy] = React.useState<null | "upload" | "send">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<SendResult | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    setFile(null); setFileError(null); setUploaded(null); setTitle(""); setTitleTouched(false); setCategory("statement"); setNote("")
    setWallets(initialWallets); setBusy(null); setError(null); setResult(null); setDragging(false)
    // Les portefeuilles initiaux ne sont relus qu'à l'ouverture : modifier la sélection ne doit pas la réinitialiser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const search = React.useCallback((query: string) => api.admin.documents.targets.query({ query }), [])

  function pick(next: File | null | undefined) {
    if (!next) return
    const problem = checkUpload(next)
    setFileError(problem)
    setUploaded(null)
    setError(null)
    if (problem) { setFile(null); return }
    setFile(next)
    if (!titleTouched) setTitle(titleFromFileName(next.name).slice(0, MAX_TITLE))
  }

  const valid = Boolean(file) && title.trim().length >= 2 && wallets.length > 0

  async function submit() {
    if (!file || !valid) return
    setError(null)
    try {
      let target = uploaded
      if (!target) {
        setBusy("upload")
        target = await uploadDocument(file)
        setUploaded(target)
      }
      setBusy("send")
      const outcome = await api.admin.documents.send.mutate({
        storageKey: target.storageKey,
        fileName: target.fileName,
        title: title.trim(),
        category: category as (typeof SEND_CATEGORIES)[number],
        note: note.trim() || undefined,
        wallets: wallets.map(({ walletType, holderId }) => ({ walletType, holderId })),
      })
      setResult(outcome)
      await onSent?.(outcome)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Envoi impossible."
      // Le fichier déjà téléversé est réutilisé à la nouvelle tentative, sauf si le serveur l'a jugé inutilisable.
      if (/Fichier introuvable|contenu du fichier|ne correspond pas/i.test(message)) setUploaded(null)
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return (
      <LegModal
        open={open}
        onOpenChange={onOpenChange}
        icon={result.sent > 0 ? "check" : "alert"}
        tone={result.sent > 0 ? "green" : "amber"}
        title={result.sent > 0 ? "Document envoyé" : "Rien n'a été envoyé"}
        description={result.sent > 0 ? `${result.sent} destinataire${result.sent > 1 ? "s" : ""} sur ${walletsLabel(result.wallets)} ${result.sent > 1 ? "ont" : "a"} reçu « ${title.trim()} » et ${result.sent > 1 ? "ont" : "a"} été notifié${result.sent > 1 ? "s" : ""}.` : "Aucun des wallets choisis n'a de destinataire actif."}
        footer={<LegButton onClick={() => onOpenChange(false)}>Fermer</LegButton>}
      >
        {result.skipped.length > 0 ? (
          <p className="lg-notice" role="status"><LegIcon name="alert" /><span>Ignorés — {result.skipped.map((item) => `${item.name} (${item.reason.toLowerCase()})`).join(" · ")}</span></p>
        ) : null}
      </LegModal>
    )
  }

  return (
    <LegModal
      open={open}
      onOpenChange={onOpenChange}
      wide
      icon="upload"
      tone="navy"
      title="Envoyer un document"
      description="Le document est stocké de façon privée, remis dans « Documents » de chaque wallet choisi, et le titulaire est notifié. L'envoi est journalisé."
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>Annuler</LegButton>
        <LegButton icon="upload" disabled={!valid} loading={busy !== null} onClick={() => void submit()}>
          {busy === "upload" ? "Téléversement…" : busy === "send" ? "Envoi…" : wallets.length > 1 ? `Envoyer à ${wallets.length} wallets` : "Envoyer"}
        </LegButton>
      </>}
    >
      <div>
        <span className="lg-label" id="dc-file-label">Fichier</span>
        <input ref={inputRef} id="dc-file" type="file" className="dc-file-input" accept={ACCEPT_ATTRIBUTE} onChange={(event) => { pick(event.target.files?.[0]); event.target.value = "" }} tabIndex={-1} aria-hidden="true" />
        {file ? (
          <div className="dc-file" role="group" aria-labelledby="dc-file-label">
            <LegSocle icon="file" tone="violet" size="md" />
            <span className="dc-file-main"><strong>{file.name}</strong><small>{formatSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Image"}{uploaded ? " · déjà téléversé" : ""}</small></span>
            <button type="button" className="dc-file-remove" onClick={() => { setFile(null); setUploaded(null) }} aria-label="Retirer le fichier" disabled={busy !== null}><LegIcon name="close" /></button>
          </div>
        ) : (
          <button
            type="button"
            className="dc-drop"
            data-dragging={dragging || undefined}
            aria-describedby="dc-file-hint"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files?.[0]) }}
          >
            <LegSocle icon="upload" tone="navy" size="lg" />
            <strong>Déposez un fichier ici</strong>
            <span>ou cliquez pour parcourir</span>
          </button>
        )}
        <p id="dc-file-hint" className="lg-hint">PDF, JPEG, PNG ou WebP · 8 Mo au maximum · le contenu est vérifié avant l'envoi.</p>
        {fileError ? <p className="lg-error" role="alert">{fileError}</p> : null}
      </div>

      <div className="dc-two">
        <div>
          <label className="lg-label" htmlFor="dc-title">Titre affiché</label>
          <input id="dc-title" className="lg-input" value={title} maxLength={MAX_TITLE} onChange={(event) => { setTitle(event.target.value); setTitleTouched(true) }} placeholder="Ex. Relevé de septembre" autoComplete="off" />
        </div>
        <div>
          <label className="lg-label" htmlFor="dc-category">Catégorie</label>
          <select id="dc-category" className="lg-input" value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
            {SEND_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="lg-fieldset">
        <legend className="lg-label">Wallets destinataires</legend>
        <HolderMultiPicker value={wallets} onChange={setWallets} search={search} idPrefix="dc" emptyLabel="Aucun wallet ne correspond à votre périmètre." />
      </fieldset>

      <div>
        <label className="lg-label" htmlFor="dc-note">Note pour le titulaire (facultative)</label>
        <textarea id="dc-note" className="lg-input lg-textarea" rows={3} value={note} maxLength={MAX_NOTE} onChange={(event) => setNote(event.target.value)} placeholder="Ex. À signer et à nous renvoyer avant la fin du mois." />
        <p className="lg-hint" aria-live="polite">{note.length} / {MAX_NOTE} caractères</p>
      </div>
      {error ? <p role="alert" className="lg-error">{error}</p> : null}
    </LegModal>
  )
}
