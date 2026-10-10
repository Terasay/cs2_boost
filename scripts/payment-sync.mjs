if (process.env.DONATIONALERTS_MODE === "orders") {
  if (!/^[a-f0-9]{64}$/i.test(process.env.PAYMENTS_SYNC_KEY || "")) throw new Error("PAYMENTS_SYNC_KEY is not configured");
  const response = await fetch("http://127.0.0.1:3000/api/payments/donationalerts/sync", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${process.env.PAYMENTS_SYNC_KEY}` },
  });
  if (!response.ok) throw new Error(`Payment sync failed (${response.status})`);
}
