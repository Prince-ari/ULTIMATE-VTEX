const OTP_TTL_MINUTES = 5

/**
 * Gabarit transactionnel autonome : les styles essentiels sont en ligne
 * pour préserver le rendu dans Gmail, Outlook et les applications mobiles.
 */
export function otpEmailHtml(code: string, firstName: string): string {
  assertOtp(code)

  const safeCode = escapeHtml(code)
  const safeName = escapeHtml(firstName.trim() || "client")
  const digits = code.split("").map(otpDigitCell).join("")

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Code de sécurité OTP — VTEX</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:#03071e;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Votre code de connexion VTEX est ${safeCode}. Il expire dans ${OTP_TTL_MINUTES} minutes.</div>
    <center style="width:100%;background-color:#03071e;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;background-color:#03071e;">
        <tr><td align="center" style="padding:40px 16px 44px;">
          <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
            <tr><td align="center" style="padding:0 0 24px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #ffb9be;border-radius:24px;background-color:#d11f2a;"><tr><td align="center" style="padding:21px 24px 19px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-align:center;"><div style="font-size:22px;line-height:27px;font-weight:800;letter-spacing:0.3px;">&#128274;&nbsp; Accès à votre espace sécurisé</div><div style="padding-top:6px;font-size:10px;line-height:13px;letter-spacing:2.4px;text-transform:uppercase;color:#ffe4e6;">Vérification de connexion VTEX</div></td></tr></table>
            </td></tr>
            <tr><td align="center" style="border:2px solid #8d98ff;border-radius:32px;background-color:#f7f8ff;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:42px 26px 38px;font-family:Arial,Helvetica,sans-serif;">
                <div style="display:inline-block;padding:9px 22px;border:1px solid #ffa0a8;border-radius:30px;background-color:#d11f2a;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:2.5px;line-height:13px;text-transform:uppercase;">&#128274;&nbsp; Code de sécurité OTP</div>
                <div style="padding-top:26px;color:#0d1238;font-size:30px;font-weight:800;line-height:36px;text-align:center;">Déverrouillez votre espace</div>
                <div style="padding:11px 12px 26px;color:#4a5280;font-size:15px;line-height:24px;text-align:center;">Bonjour ${safeName}, saisissez ce code unique pour accéder à votre espace bancaire VTEX en toute sécurité.</div>
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;background-color:#cdd2ee;">&nbsp;</td></tr></table>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:27px auto 21px;"><tr>${digits}</tr></table>
                <div style="padding:11px 18px;border:1px solid #f3bcc0;border-radius:24px;background-color:#fff5f5;color:#c41e2a;font-size:12px;font-weight:800;line-height:17px;">&#9200;&nbsp; Ce code expire dans <strong>${OTP_TTL_MINUTES} minutes</strong></div>
                <div style="padding:22px 14px 0;color:#505987;font-size:13px;line-height:21px;text-align:center;">Pour copier facilement le code, sélectionnez cette ligne :<br /><span style="display:inline-block;margin-top:8px;padding:8px 14px;border:1px dashed #8d98ff;border-radius:8px;background-color:#ffffff;color:#0d1448;font-family:monospace;font-size:18px;font-weight:800;letter-spacing:5px;white-space:nowrap;">${safeCode}</span></div>
                <div style="margin-top:24px;padding:17px 18px;border:1px solid #d9def7;border-radius:18px;background-color:#ffffff;color:#5a6296;font-size:13px;font-style:italic;line-height:21px;text-align:center;">Pour votre protection, aucun conseiller VTEX ne vous demandera jamais de communiquer ce code.</div>
              </td></tr></table>
            </td></tr>
            <tr><td align="center" style="padding:24px 0 0;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #4a56e0;border-radius:28px;background-color:#0d1448;"><tr><td align="center" style="padding:28px 24px 25px;font-family:Arial,Helvetica,sans-serif;text-align:center;"><div style="color:#ffffff;font-size:21px;font-weight:800;line-height:25px;">VTEX</div><div style="padding-top:6px;color:#aeb7ff;font-size:10px;font-weight:600;letter-spacing:3px;line-height:14px;text-transform:uppercase;">Sécurité · Confidentialité · Fiabilité</div><div style="margin:19px auto 17px;width:72%;height:1px;line-height:1px;font-size:1px;background-color:#4a56e0;">&nbsp;</div><div style="color:#c6cced;font-size:12px;font-style:italic;line-height:18px;">Ceci est un message automatique — merci de ne pas y répondre.</div></td></tr></table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </center>
  </body>
</html>`
}

/** Texte de repli pour les clients qui simplifient l’HTML. */
export function otpEmailText(code: string, firstName: string): string {
  assertOtp(code)
  const name = firstName.trim() || "client"
  return [
    `Bonjour ${name},`,
    "",
    "Votre code de sécurité OTP pour VTEX est :",
    code,
    "",
    `Il expire dans ${OTP_TTL_MINUTES} minutes. Vous pouvez copier et coller ce code dans VTEX.`,
    "",
    "Pour votre protection, aucun conseiller VTEX ne vous demandera ce code.",
  ].join("\n")
}

function otpDigitCell(digit: string): string {
  return `<td style="padding:0 3px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border:3px solid #8d98ff;border-radius:17px;background-color:#0d1448;"><tr><td align="center" valign="middle" style="width:56px;height:72px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:34px;font-weight:800;line-height:72px;text-align:center;text-shadow:0 1px 0 #03071e;">${digit}</td></tr></table></td>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function assertOtp(code: string): void {
  if (!/^\d{6}$/.test(code)) throw new Error("Un code OTP doit contenir exactement six chiffres.")
}
