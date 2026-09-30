import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

// Email in uscita (inviti e notifiche) tramite SMTP, per esempio Brevo con un dominio proprio.
// Se SMTP non è configurato, emailConfigurata() è falso e l'interfaccia mostra il link da copiare.

export function emailConfigurata(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_MITTENTE)
}

let trasporto: Transporter | null = null

function prendiTrasporto() {
  trasporto ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  return trasporto
}

export async function inviaEmail(a: { a: string; oggetto: string; testo: string; html: string }): Promise<void> {
  if (!emailConfigurata()) throw new Error('Servizio email non configurato')
  await prendiTrasporto().sendMail({
    from: process.env.EMAIL_MITTENTE,
    to: a.a,
    subject: a.oggetto,
    text: a.testo,
    html: a.html,
  })
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Impaginazione semplice e sobria per tutte le email della piattaforma. */
export function htmlEmail(titolo: string, paragrafi: string[], pulsante?: { testo: string; url: string }, nota?: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f4f5fa;font-family:Arial,Helvetica,sans-serif;color:#1e2440">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<p style="font-weight:bold;font-size:16px;margin:0 0 24px">BigBrotherStudio</p>
<div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e3e5ef">
<h1 style="font-size:20px;margin:0 0 16px">${esc(titolo)}</h1>
${paragrafi.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${p}</p>`).join('\n')}
${pulsante ? `<p style="margin:24px 0"><a href="${esc(pulsante.url)}" style="background:#2f3a8f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${esc(pulsante.testo)}</a></p>
<p style="font-size:12px;color:#5b6180;word-break:break-all">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>${esc(pulsante.url)}</p>` : ''}
${nota ? `<p style="font-size:12px;color:#5b6180;margin-top:20px">${nota}</p>` : ''}
</div></div></body></html>`
}

export { esc as escapeHtml }
