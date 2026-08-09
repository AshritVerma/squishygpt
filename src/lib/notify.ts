// Out-of-band alerts so Ashrit finds out the moment Serena redeems a reward,
// instead of waiting to be told or noticing it in the DB. Redemption itself
// stays instant/client-side; this fires a best-effort ping over whichever
// channels are configured via env vars (SMS, Slack, email). Uses plain fetch —
// no extra dependencies.

export interface RedeemAlert {
  rewardId: string;
  title: string;
  emoji: string;
  cost: number;
  balance: number; // remaining balance after the redeem
}

function composeMessage(a: RedeemAlert): string {
  return `${a.emoji} SquishyGPT: Serena just redeemed "${a.title}" for ${a.cost} paw points. Balance is now ${a.balance}. Time to deliver! 💝`;
}

// --- Twilio SMS (primary — you gave a phone number) ---
async function sendSms(text: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.ALERT_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return false;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: text }),
    },
  );
  if (!res.ok) {
    console.error(`[notify] Twilio SMS failed (${res.status}): ${await res.text()}`);
  }
  return res.ok;
}

// --- Slack incoming webhook (optional) ---
async function sendSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error(`[notify] Slack webhook failed (${res.status})`);
  }
  return res.ok;
}

// --- Email via Resend (optional) ---
async function sendEmail(text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!key || !to || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "🐾 SquishyGPT reward redeemed",
      text,
    }),
  });
  if (!res.ok) {
    console.error(`[notify] Resend email failed (${res.status}): ${await res.text()}`);
  }
  return res.ok;
}

/**
 * Fire a redeem alert over every configured channel. Best-effort: a failing or
 * unconfigured channel never blocks the others, and the function never throws.
 * Returns the list of channels that succeeded.
 */
export async function notifyRedeem(alert: RedeemAlert): Promise<string[]> {
  const text = composeMessage(alert);

  const channels: Array<[string, Promise<boolean>]> = [
    ["sms", sendSms(text)],
    ["slack", sendSlack(text)],
    ["email", sendEmail(text)],
  ];

  const results = await Promise.allSettled(channels.map(([, p]) => p));
  const sent = channels
    .filter((_, i) => {
      const r = results[i];
      return r.status === "fulfilled" && r.value === true;
    })
    .map(([name]) => name);

  if (sent.length === 0) {
    console.warn(
      `[notify] Redeem alert had nowhere to go — no notification channel is configured. ` +
        `Set Twilio (SMS), Slack, or Resend env vars. Alert was: ${text}`,
    );
  }

  return sent;
}
