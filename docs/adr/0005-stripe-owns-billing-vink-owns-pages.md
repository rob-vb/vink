# Stripe owns the billing; Vink owns the Pages

Paid Plans and Top-ups go through Stripe: Checkout to start a Plan or buy a Top-up, the Customer Portal to change Plan, cancel, pay and see invoices. Custom Plans stay by hand (`pages:setPlan`), paid by invoice.

We sell through **Managed Payments**: Stripe, through Link, is the merchant of record. It works out, collects and remits the VAT in each country, handles fraud, disputes and payment support, and sends the receipts and invoices ("Sold through Link"). So Vink needs no VAT registrations abroad and no Stripe Tax. The price is that Stripe decides much of Checkout: no `automatic_tax`, `tax_id_collection`, `customer_update` or `invoice_creation`, no list of payment methods, and no tax IDs on a Customer with a Managed Payments Subscription. Customers pay by card, Apple Pay, Google Pay or Link; iDEAL and SEPA Direct Debit aren't offered. Their statement shows `LINK.COM* <our descriptor>`. Only fully automated digital products qualify, so the paid integration work and Custom Plans' invoices stay outside Managed Payments.

Stripe is the source of truth for the **Subscription**; Vink never decides who pays. Every webhook (`convex/billing.ts`) reads the Customer's current Subscription back from Stripe and hands its state to `billingState:applySubscription`, which is idempotent, so retried and out-of-order webhooks are harmless. Organisations are found through the Stripe Customer we create at their first Checkout, not through metadata.

Vink stays the source of truth for the **Pages**. A Plan's Pages are per month also when it's billed annually, so a Pages period is not Stripe's billing period: it is monthly, on the day of the Subscription's billing anchor, and the `pages periods` cron renews it as before. A change of Plan keeps the period and the Pages used, with the new allowance. The Customer Portal moves to a smaller Plan or to monthly billing only at the end of the period, and a cancelled Plan runs to the end of its period; after that the Organisation is back on whatever Free Pages it has left, and its Top-ups lapse.

The code knows Prices by **lookup key** (`vink_<plan>_<monthly|annual>`, `vink_topup_100`), never by ID, so one codebase serves a sandbox and live mode. `scripts/stripe-setup.ts` makes the catalog, the Customer Portal configuration and the webhook endpoint in either; a new price in `lib/plans.ts` becomes a new Price that takes over the lookup key, and existing Subscriptions keep the old one.

## Consequences

- Each Convex deployment needs `STRIPE_SECRET_KEY` (a restricted key), `STRIPE_WEBHOOK_SECRET` and `STRIPE_PORTAL_CONFIGURATION` for its own Stripe environment: the dev deployment a sandbox, prod live mode.
- Every Product needs a tax code that Managed Payments accepts; `scripts/stripe-setup.ts` sets it.
- Payment methods are Managed Payments' own; the code never lists them.
- A monthly Plan whose renewal payment fails keeps its Plan while Stripe retries (`past_due`); when Stripe gives up and cancels, the Plan goes.
