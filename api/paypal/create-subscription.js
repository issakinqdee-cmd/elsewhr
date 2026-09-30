import { createClient } from "@supabase/supabase-js";

function paypalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth failed: ${response.status}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return res.status(503).json({ error: "PayPal is not configured yet." });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Authentication required." });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return res.status(401).json({ error: "Invalid session." });

  const planId = req.body?.plan === "yearly"
    ? process.env.PAYPAL_PLAN_ID_YEARLY
    : process.env.PAYPAL_PLAN_ID_MONTHLY;

  if (!planId) return res.status(503).json({ error: "The selected PayPal plan is not configured." });

  try {
    const { access_token } = await getPayPalAccessToken();
    const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: userData.user.id,
        application_context: {
          brand_name: "ELSEWHR",
          locale: "en-US",
          user_action: "SUBSCRIBE_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${process.env.APP_URL}/?paypal=success`,
          cancel_url: `${process.env.APP_URL}/?paypal=cancelled`,
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Unable to create PayPal subscription.",
        details: payload,
      });
    }

    await supabase.from("subscriptions").upsert({
      user_id: userData.user.id,
      provider: "paypal",
      provider_subscription_id: payload.id,
      plan: req.body?.plan === "yearly" ? "yearly" : "monthly",
      status: payload.status?.toLowerCase() || "created",
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider_subscription_id" });

    const approvalUrl = payload.links?.find((link) => link.rel === "approve")?.href || null;
    return res.status(200).json({
      subscriptionId: payload.id,
      approvalUrl,
      status: payload.status,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal subscription failed." });
  }
}
