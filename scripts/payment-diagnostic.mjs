import Database from "better-sqlite3";
import { databasePath } from "../db/connection.mjs";
import { openAccess } from "../lib/order-access.mjs";
import { donationConfig, donationMinorAmount, donationPage, normalizeDonation } from "../lib/donationalerts.mjs";

const [orderId, alertId] = process.argv.slice(2);
const expectedErrors = new Set(["Use: node scripts/payment-diagnostic.mjs <order-id> [donation-id]", "Order not found", "DonationAlerts is not connected to the configured account", "DonationAlerts token expired. Run a payment check on the website first", "DonationAlerts authorization expired. Reconnect the account", "DonationAlerts API is unavailable"]);
let database;
try {
  if (!/^[a-f0-9-]{36}$/i.test(orderId || "") || (alertId && !/^\d{1,16}$/.test(alertId))) throw new Error("Use: node scripts/payment-diagnostic.mjs <order-id> [donation-id]");
  database = new Database(databasePath(), { readonly: true, fileMustExist: true, timeout: 5000 });
  const order = database.prepare("SELECT id,status,total_amount,quoted_currency,paid_at FROM orders WHERE id=?").get(orderId);
  if (!order) throw new Error("Order not found");
  const invoices = database.prepare("SELECT id,reference,account_id,amount,currency,status,expires_at FROM payment_intents WHERE order_id=? ORDER BY created_at DESC LIMIT 5").all(orderId);
  const references = new Set(invoices.map(invoice => invoice.reference));
  const local = invoices.map(invoice => ({ id: invoice.id, amount: invoice.amount / 100, currency: invoice.currency, status: invoice.status, expiresAt: new Date(invoice.expires_at).toISOString(), receipts: database.prepare("SELECT id,amount,currency,result,created_at FROM payment_receipts WHERE intent_id=? ORDER BY created_at DESC LIMIT 5").all(invoice.id).map(row => ({ id: row.id.split(":").at(-1), amount: row.amount / 100, currency: row.currency, result: row.result, recordedAt: new Date(row.created_at).toISOString() })) }));
  const config = donationConfig();
  const connection = database.prepare("SELECT secret,code,account_id FROM donation_connections WHERE id='donationalerts-test'").get();
  if (!connection?.secret || !config.account || connection.code?.toLowerCase() !== config.account.toLowerCase()) throw new Error("DonationAlerts is not connected to the configured account");
  const tokens = JSON.parse(openAccess("donationalerts-test", connection.secret).tokens);
  if (typeof tokens.accessToken !== "string" || tokens.expiresAt <= Date.now() + 10000) throw new Error("DonationAlerts token expired. Run a payment check on the website first");
  const alerts = [];
  for (let page = 1; page <= 3; page++) {
    if (page > 1) await new Promise(resolve => setTimeout(resolve, 1000));
    const batch = await donationPage(tokens.accessToken, page);
    for (const raw of batch.donations) {
      const donation = normalizeDonation(raw);
      if (String(raw?.id) !== alertId && (!donation || !references.has(donation.reference))) continue;
      const matchedInvoice = invoices.find(invoice => invoice.reference === donation?.reference);
      const amounts = {};
      for (const name of ["amount", "currency", "original_amount", "original_currency", "amount_received", "amount_before_fees", "fee", "commission"]) {
        const value = raw[name];
        if ((typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^(?:[A-Z]{3}|\d{1,9}(?:\.\d{1,5})?)$/.test(value))) amounts[name] = value;
      }
      const message = typeof raw.message === "string" ? raw.message : null;
      const referenceCount = message === null ? 0 : [...message.matchAll(/(?<![a-z0-9_-])CS2(?:TEST|PAY)-[a-f0-9]{32}(?![a-z0-9_-])/gi)].length;
      const safeType = value => typeof value === "string" && /^[a-z_]{1,32}$/i.test(value) ? value : typeof value === "number" && Number.isSafeInteger(value) ? value : null;
      const expectedInvoice = matchedInvoice ?? invoices[0];
      const validMinorAmount = donationMinorAmount(raw.amount);
      const matchFailure = donation ? matchedInvoice ? null : "different_reference" : message === null ? "message_not_text" : !message.trim() ? "empty_message" : referenceCount === 0 ? "missing_or_incomplete_reference" : referenceCount > 1 ? "multiple_references" : "invalid_alert_fields";
      alerts.push({
        id: String(raw.id), fields: Object.keys(raw).sort().slice(0, 50), amounts,
        amountType: typeof raw.amount, alertType: safeType(raw.name), messageType: safeType(raw.message_type),
        message: { type: typeof raw.message, length: message?.length ?? null, empty: message === null || message.trim().length === 0, referenceCount },
        matchFailure, validAlert: Boolean(donation), referenceMatches: Boolean(matchedInvoice),
        amountMatches: Boolean(expectedInvoice && validMinorAmount === expectedInvoice.amount),
        currencyMatches: Boolean(expectedInvoice && raw.currency === expectedInvoice.currency),
        containsOrderReference: message !== null && invoices.some(invoice => message.toUpperCase().includes(invoice.reference.toUpperCase())),
        validMinorAmount,
      });
    }
    if (!batch.hasMore || (alertId && alerts.some(alert => alert.id === alertId))) break;
  }
  const sync = database.prepare("SELECT value FROM service_state WHERE key='payment-sync'").get();
  console.log(JSON.stringify({ order: { id: order.id, status: order.status, amount: order.total_amount / 100, currency: order.quoted_currency || "RUB", paid: Boolean(order.paid_at) }, invoices: local, sync: sync ? JSON.parse(sync.value) : null, providerAlerts: alerts, requestedAlertFound: alertId ? alerts.some(alert => alert.id === alertId) : null }, null, 2));
} catch (error) {
  console.error(error instanceof Error && expectedErrors.has(error.message) ? error.message : "Payment diagnostic failed. Credentials and message contents were not printed.");
  process.exitCode = 1;
} finally {
  database?.close();
}
