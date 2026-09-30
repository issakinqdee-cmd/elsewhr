export async function startPaypalSubscription(plan, accessToken) {
  if (!accessToken) throw new Error("Sign in before subscribing.");
  const response = await fetch("/api/paypal/create-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ plan }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "PayPal checkout failed.");
  if (!payload.approvalUrl) throw new Error("PayPal did not return an approval link.");
  return payload.approvalUrl;
}
