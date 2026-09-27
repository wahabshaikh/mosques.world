export type Mail = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Plain, accessible HTML shell shared by every email (the text part carries the same content). */
export function layout(title: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${escapeHtml(line)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0B6E4F;color:#ffffff;border-radius:12px;padding:12px 20px;font-weight:700;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : "";
  const small = footer ? `<p style="margin:24px 0 0;font-size:13px;color:#5E5A53">${escapeHtml(footer)}</p>` : "";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#F6F4EF;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1F1D1A"><div style="max-width:520px;margin:0 auto;padding:32px 24px"><p style="font-weight:800;color:#0B6E4F;margin:0 0 24px">mosques.world</p><div style="background:#ffffff;border-radius:16px;padding:24px"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}</div>${small}</div></body></html>`;
}

export function otpMail(to: string, otp: string): Mail {
  return {
    to,
    subject: `Your mosques.world code: ${otp}`,
    text: `Your sign-in code is ${otp}\n\nIt expires in 10 minutes. If you did not try to sign in, ignore this email.`,
    html: layout("Your sign-in code", [`Enter this code to sign in: ${otp}`, "It expires in 10 minutes. If you did not try to sign in, ignore this email."]),
  };
}

export function welcomeMail(to: string, input: { username: string; baseUrl: string }): Mail {
  const guidelines = `${input.baseUrl}/guidelines`;
  return {
    to,
    subject: "Welcome to mosques.world",
    text: `Assalamu alaikum @${input.username},\n\nThank you for joining. The best contribution is a quick "yes, still 4:30" from someone who has seen the board. Only mark what you've seen yourself.\n\nCommunity guidelines: ${guidelines}\n\nJazakAllahu khayran.`,
    html: layout(
      `Welcome, @${input.username}`,
      [
        "Thank you for joining. The best contribution is a quick “yes, still 4:30” from someone who has seen the board.",
        "Only mark what you've seen yourself. JazakAllahu khayran.",
      ],
      { label: "Read the guidelines", url: guidelines },
    ),
  };
}

export function deletionMail(to: string): Mail {
  return {
    to,
    subject: "Your mosques.world account was deleted",
    text: "Your account and personal details have been deleted. Times you confirmed stay on the site as contributions from a former member, so the history remains consistent.\n\nIf you did not do this, reply to this email.",
    html: layout("Your account was deleted", [
      "Your account and personal details have been deleted.",
      "Times you confirmed stay on the site as contributions from a former member, so the history remains consistent.",
      "If you did not do this, reply to this email.",
    ]),
  };
}

export function timesLiveMail(to: string, input: { placeName: string; placeUrl: string; unsubscribeUrl: string }): Mail {
  return {
    to,
    subject: `Iqamah times can now be added for ${input.placeName}`,
    text: `You asked to hear when iqamah times open for ${input.placeName}. The community can now add and confirm them:\n\n${input.placeUrl}\n\nUnsubscribe: ${input.unsubscribeUrl}`,
    html: layout(
      "Iqamah times are live",
      [`You asked to hear when iqamah times open for ${input.placeName}. The community can now add and confirm them.`],
      { label: `Open ${input.placeName}`, url: input.placeUrl },
      `You are receiving this because you joined the waitlist. Unsubscribe: ${input.unsubscribeUrl}`,
    ),
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
