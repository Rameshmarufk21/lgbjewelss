"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PRODUCT_STATUSES, ASSET_TYPES, type AssetType, type ProductStatus } from "@/lib/types/status";
import { assetFileUrl } from "@/lib/assetUrl";

/** Preset labels for invoice line metal/karat (stored as `metalOrKarat` string). */
const METAL_KARAT_PRESETS = [
  { value: "14K", label: "14K" },
  { value: "18K", label: "18K" },
  { value: "10K", label: "10K" },
  { value: "14K Rose", label: "14K Rose" },
  { value: "18K Rose", label: "18K Rose" },
  { value: "14K White", label: "14K White" },
  { value: "18K White", label: "18K White" },
  { value: "Platinum", label: "Platinum" },
  { value: "14K RTC", label: "14K RTC" },
  { value: "18K RTC", label: "18K RTC" },
  { value: "Sterling", label: "Sterling" },
] as const;

type Maker = { id: string; name: string };

type Asset = {
  id: string;
  type: string;
  originalName: string;
  storedPath: string;
  publicUrl: string | null;
  mimeType: string;
};

type InvoiceLine = {
  id: string;
  description: string;
  metalOrKarat: string | null;
  weightGrams: number | null;
  weightDwt: number | null;
  quantity: number | null;
  lineTotalCents: number | null;
};

type VendorInvoice = {
  id: string;
  vendor: string;
  invoiceNo: string;
  totalCents: number;
  currency: string;
  paymentStatus: string;
  goldWeightG: number | null;
  lines: InvoiceLine[];
};

type Stone = {
  id: string;
  supplier: string | null;
  shape: string | null;
  carat: number | null;
  costCents: number | null;
  notes: string | null;
  itemCategory: string | null;
  colorGrade: string | null;
  clarityGrade: string | null;
  sourcing: string | null;
  certificateNumber: string | null;
  certificateLab: string | null;
};

type Finding = {
  id: string;
  description: string;
  sourceShop: string | null;
  costCents: number;
};

type ExtractionJob = {
  id: string;
  kind: string;
  status: string;
  extractedJson: string | null;
  errorMessage: string | null;
  asset: Asset;
};

type Activity = {
  id: string;
  action: string;
  createdAt: string;
  payloadJson: string | null;
};

type Product = {
  id: string;
  displayName: string | null;
  cadFilenameStem: string | null;
  status: string;
  makerId: string | null;
  maker: Maker | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  clientNotes: string | null;
  sellPriceCents: number | null;
  currency: string;
  notes: string | null;
  assets: Asset[];
  vendorInvoices: VendorInvoice[];
  stones: Stone[];
  findings: Finding[];
  extractions: ExtractionJob[];
  activityLogs: Activity[];
};

export function OrderDetailClient({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [makers, setMakers] = useState<Maker[]>([]);
  const [busy, setBusy] = useState(false);
  const [jsonDraft, setJsonDraft] = useState<Record<string, string>>({});
  /** Show custom metal text when preset is "Other" (per vendor invoice line form). */
  const [metalOtherByInvoice, setMetalOtherByInvoice] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [pRes, mRes] = await Promise.all([
      fetch(`/api/products/${id}`),
      fetch("/api/makers"),
    ]);
    const pData = await pRes.json();
    const mData = await mRes.json();
    if (!pRes.ok) throw new Error(pData.error ?? "Not found");
    setProduct(pData.product);
    setMakers(mData.makers ?? []);
  }, [id]);

  useEffect(() => {
    void load().catch(() => setProduct(null));
  }, [load]);

  const totals = useMemo(() => {
    if (!product) return null;
    const casting = product.vendorInvoices.reduce((s, i) => s + i.totalCents, 0);
    const stones = product.stones.reduce((s, x) => s + (x.costCents ?? 0), 0);
    const findings = product.findings.reduce((s, x) => s + x.costCents, 0);
    const grand = casting + stones + findings;
    const profit =
      product.sellPriceCents != null ? product.sellPriceCents - grand : null;
    return { casting, stones, findings, grand, profit };
  }, [product]);

  async function savePatch(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProduct(data.product);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAsset(file: File, type: AssetType) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("type", type);
      const res = await fetch(`/api/products/${id}/assets`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startExtraction(assetId: string, kind: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Job failed");
      const run = await fetch(`/api/extraction/${data.job.id}/run`, { method: "POST" });
      const runData = await run.json();
      if (!run.ok) throw new Error(runData.error ?? "Run failed");
      await load();
      alert(`Extraction status: ${runData.job?.status ?? "done"}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function commitExtraction(jobId: string, payloadText: string) {
    setBusy(true);
    try {
      const payload = JSON.parse(payloadText);
      const res = await fetch(`/api/extraction/${jobId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Commit failed");
      await load();
      alert("Committed to catalog.");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addInvoice(formEl: HTMLFormElement) {
    const body = Object.fromEntries(new FormData(formEl).entries());
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}/vendor-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: body.vendor,
          invoiceNo: body.invoiceNo,
          total: Number(body.total),
          currency: (body.currency as string) || "USD",
          goldWeightG: body.goldWeightG ? Number(body.goldWeightG) : undefined,
          invoiceDate: body.invoiceDate ? String(body.invoiceDate) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
      formEl.reset();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!product) {
    return (
      <p className="text-sm lgb-muted">
        Loading… or not found. <Link href="/">Back</Link>
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="lgb-link text-sm">
            ← Orders
          </Link>
          <h1 className="page-title mt-2" style={{ fontSize: "1.55rem" }}>
            {product.displayName || product.cadFilenameStem || "Untitled"}
          </h1>
          <p className="mt-1 font-mono text-xs lgb-muted">{product.id}</p>
        </div>
        {totals ? (
          <div className="lgb-section text-sm text-[var(--text2)]">
            <div className="text-xs uppercase tracking-wide text-[var(--text3)]">Costs (cents)</div>
            <div className="mt-1 space-y-0.5">
              <div>Casting invoices: {totals.casting}</div>
              <div>Stones: {totals.stones}</div>
              <div>Findings: {totals.findings}</div>
              <div className="font-medium text-[var(--text)]">Grand: {totals.grand}</div>
              {totals.profit != null ? (
                <div className={totals.profit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  Profit vs sell: {totals.profit}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {(() => {
        const imgs = product.assets.filter((a) => a.mimeType.startsWith("image/"));
        if (!imgs.length) return null;
        return (
          <section className="lgb-section">
            <h2>
              Reference photos (memos, invoices, bench)
            </h2>
            <p className="mt-1 text-xs lgb-muted">
              Tap an icon to open. Memo shots are for reference — stone data is entered in the typed
              form below, not from OCR.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {imgs.map((a) => (
                <a
                  key={a.id}
                  href={assetFileUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                  title={`${a.type}: ${a.originalName}`}
                  className="relative h-14 w-14 overflow-hidden rounded-lg border border-[var(--border)] ring-1 ring-[var(--border2)] hover:ring-[var(--peacock)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetFileUrl(a)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-0.5 text-[8px] text-[var(--cream)]">
                    {a.type.replace(/_/g, " ")}
                  </span>
                </a>
              ))}
            </div>
          </section>
        );
      })()}

      <section className="lgb-section">
        <h2>Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Display name</span>
            <input
              defaultValue={product.displayName ?? ""}
              id="f_displayName"
              className="fc w-full"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">CAD stem</span>
            <input
              defaultValue={product.cadFilenameStem ?? ""}
              id="f_cadStem"
              className="fc w-full"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Status</span>
            <select
              id="f_status"
              defaultValue={product.status}
              className="fc w-full"
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Maker</span>
            <select
              id="f_maker"
              defaultValue={product.makerId ?? ""}
              className="fc w-full"
            >
              <option value="">—</option>
              {makers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Client name</span>
            <input
              defaultValue={product.clientName ?? ""}
              id="f_clientName"
              className="fc w-full"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Client phone</span>
            <input
              defaultValue={product.clientPhone ?? ""}
              id="f_clientPhone"
              className="fc w-full"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Client email</span>
            <input
              defaultValue={product.clientEmail ?? ""}
              id="f_clientEmail"
              className="fc w-full"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="lgb-muted">Sell price (major units)</span>
            <input
              defaultValue={
                product.sellPriceCents != null ? String(product.sellPriceCents / 100) : ""
              }
              id="f_sell"
              className="fc w-full"
            />
          </label>
          <label className="col-span-full block space-y-1 text-sm">
            <span className="lgb-muted">Notes</span>
            <textarea
              defaultValue={product.notes ?? ""}
              id="f_notes"
              rows={3}
              className="fc w-full"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          className="btn btn-g mt-4 disabled:opacity-50"
          onClick={() => {
            const gv = (sel: string) =>
              (document.getElementById(sel) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
                .value;
            const sellRaw = gv("f_sell");
            void savePatch({
              displayName: gv("f_displayName") || null,
              cadFilenameStem: gv("f_cadStem") || null,
              status: gv("f_status") as ProductStatus,
              makerId: gv("f_maker") || null,
              clientName: gv("f_clientName") || null,
              clientPhone: gv("f_clientPhone") || null,
              clientEmail: gv("f_clientEmail") || null,
              sellPriceCents: sellRaw ? Math.round(Number(sellRaw) * 100) : null,
              notes: gv("f_notes") || null,
            });
          }}
        >
          Save details
        </button>
      </section>

      <section className="lgb-section">
        <h2>Files</h2>
        <p className="mt-1 text-sm lgb-muted">
          Upload CAD, invoice scans, memo photos, or setter receipts.{" "}
          <strong className="text-[var(--peacock)]">Printed invoices</strong>: use &quot;Extract invoice&quot;
          (Tesseract draft, then review). <strong className="text-[var(--peacock)]">Memos</strong>: no OCR —
          keep photos as references and use the stone form.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <select id="assetType" className="fc text-sm">
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="file"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const type = (document.getElementById("assetType") as HTMLSelectElement)
                .value as AssetType;
              void uploadAsset(f, type);
            }}
          />
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {product.assets.map((a) => (
            <li
              key={a.id}
              className="lgb-row flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div>
                <span className="text-[var(--text)]">{a.originalName}</span>
                <span className="ml-2 text-xs lgb-muted">{a.type}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  className="lgb-link text-xs"
                  href={assetFileUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                {a.mimeType.startsWith("image/") &&
                (a.type === "invoice_casting" ||
                  a.type === "invoice_finding" ||
                  a.type === "invoice_other" ||
                  a.type === "photo") ? (
                  <button
                    type="button"
                    className="text-xs lgb-link"
                    onClick={() => void startExtraction(a.id, "invoice_casting")}
                  >
                    Extract invoice
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="lgb-section">
        <h2>
          Extraction jobs
        </h2>
        <ul className="mt-3 space-y-3 text-sm">
          {product.extractions.filter((j) => j.kind !== "memo").map((j) => (
            <li key={j.id} className="lgb-row p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs lgb-muted">{j.id}</span>
                <span className="text-xs lgb-muted">
                  {j.kind} · {j.status}
                </span>
              </div>
              {j.errorMessage ? (
                <p className="mt-2 text-xs text-rose-300">{j.errorMessage}</p>
              ) : null}
              <div className="mt-2 space-y-2">
                <textarea
                  className="fc min-h-32 font-mono text-xs"
                  value={
                    jsonDraft[j.id] ??
                    (j.extractedJson
                      ? (() => {
                          try {
                            return JSON.stringify(JSON.parse(j.extractedJson), null, 2);
                          } catch {
                            return j.extractedJson;
                          }
                        })()
                      : "{}")
                  }
                  onChange={(e) => setJsonDraft((d) => ({ ...d, [j.id]: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  onClick={() => {
                    const text =
                      jsonDraft[j.id] ??
                      (j.extractedJson
                        ? (() => {
                            try {
                              return JSON.stringify(JSON.parse(j.extractedJson), null, 2);
                            } catch {
                              return j.extractedJson;
                            }
                          })()
                        : "{}");
                    void commitExtraction(j.id, text);
                  }}
                >
                  Commit parsed JSON
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="lgb-section">
        <h2>Vendor invoices</h2>
        <form
          className="mt-3 grid gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addInvoice(e.currentTarget);
          }}
        >
          <input name="vendor" placeholder="Vendor" className="fc text-sm" required />
          <input name="invoiceNo" placeholder="Invoice #" className="fc text-sm" required />
          <input name="total" type="number" step="0.01" placeholder="Total" className="fc text-sm" required />
          <input name="goldWeightG" type="number" step="0.001" placeholder="Gold g (opt)" className="fc text-sm" />
          <input name="invoiceDate" type="date" className="fc text-sm" title="Invoice date (for monthly metal report)" />
          <input name="currency" placeholder="USD" className="fc text-sm md:col-span-1" />
          <button type="submit" className="btn btn-p py-2 text-sm md:col-span-3">
            Add invoice
          </button>
        </form>
        <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
          {product.vendorInvoices.map((inv) => (
            <li key={inv.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {inv.vendor} · {inv.invoiceNo}{" "}
                  <span className="lgb-muted">
                    ({(inv.totalCents / 100).toFixed(2)} {inv.currency})
                  </span>
                </span>
                <span className="text-xs uppercase lgb-muted">{inv.paymentStatus}</span>
              </div>
              {inv.lines?.length ? (
                <ul className="mt-2 space-y-1 border-l border-[var(--border)] pl-3 text-xs lgb-muted">
                  {inv.lines.map((ln) => (
                    <li key={ln.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {ln.metalOrKarat ? <span className="font-semibold text-[var(--peacock)]">{ln.metalOrKarat}</span> : null}{" "}
                        {ln.description}
                        {ln.weightGrams != null ? ` · ${ln.weightGrams}g` : ""}
                        {ln.weightDwt != null ? ` · ${ln.weightDwt}dwt` : ""}
                        {ln.lineTotalCents != null
                          ? ` · $${(ln.lineTotalCents / 100).toFixed(2)}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="text-rose-400/90 hover:underline"
                        onClick={async () => {
                          await fetch(`/api/vendor-invoice-lines/${ln.id}`, { method: "DELETE" });
                          await load();
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="mt-2 flex flex-wrap gap-2 text-xs"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const preset = String(fd.get("metalPreset") ?? "").trim();
                  const custom = String(fd.get("metalCustom") ?? "").trim();
                  let metalOrKarat: string | null = null;
                  if (preset === "_other") metalOrKarat = custom || null;
                  else if (preset) metalOrKarat = preset;
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/vendor-invoices/${inv.id}/lines`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        description: fd.get("description"),
                        metalOrKarat,
                        weightGrams: fd.get("weightGrams") ? Number(fd.get("weightGrams")) : null,
                        weightDwt: fd.get("weightDwt") ? Number(fd.get("weightDwt")) : null,
                        lineTotal: fd.get("lineTotal") ? Number(fd.get("lineTotal")) : null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Failed");
                    await load();
                    (e.currentTarget as HTMLFormElement).reset();
                    setMetalOtherByInvoice((s) => ({ ...s, [inv.id]: false }));
                  } catch (err) {
                    alert(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input name="description" placeholder="Description (e.g. BR-09 Yellow 14K)" className="fc min-w-[140px] flex-1 text-xs" required />
                <select
                  name="metalPreset"
                  defaultValue=""
                  className="fc w-[8.5rem] text-xs"
                  onChange={(ev) =>
                    setMetalOtherByInvoice((s) => ({ ...s, [inv.id]: ev.currentTarget.value === "_other" }))
                  }
                >
                  <option value="">Metal / karat</option>
                  {METAL_KARAT_PRESETS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value="_other">Other…</option>
                </select>
                {metalOtherByInvoice[inv.id] ? (
                  <input
                    name="metalCustom"
                    placeholder="Custom (e.g. 22K)"
                    className="fc w-28 text-xs"
                  />
                ) : null}
                <input name="weightGrams" type="number" step="0.01" placeholder="g" className="fc w-16 text-xs" />
                <input name="weightDwt" type="number" step="0.01" placeholder="dwt" className="fc w-16 text-xs" />
                <input name="lineTotal" type="number" step="0.01" placeholder="$ line" className="fc w-20 text-xs" />
                <button type="submit" className="btn btn-g btn-sm">
                  + Line
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="lgb-section">
          <h2>
            Stones (typed intake)
          </h2>
          <p className="mt-1 text-xs lgb-muted">
            Use this instead of memo OCR. Optionally link a memo photo you already uploaded.
          </p>
          <form
            className="mt-3 grid gap-2 text-sm md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              try {
                const aid = fd.get("memoAssetId");
                const res = await fetch(`/api/products/${id}/stones`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    supplier: fd.get("supplier") || null,
                    shape: fd.get("shape") || null,
                    carat: fd.get("carat") ? Number(fd.get("carat")) : null,
                    cost: fd.get("cost") ? Number(fd.get("cost")) : null,
                    notes: fd.get("notes") || null,
                    itemCategory: fd.get("itemCategory") || null,
                    colorGrade: fd.get("colorGrade") || null,
                    clarityGrade: fd.get("clarityGrade") || null,
                    sourcing: fd.get("sourcing") || null,
                    certificateNumber: fd.get("certificateNumber") || null,
                    certificateLab: fd.get("certificateLab") || null,
                    assetId: aid && String(aid) !== "" ? String(aid) : null,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                await load();
                (e.currentTarget as HTMLFormElement).reset();
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <select name="itemCategory" className="fc text-sm">
              <option value="">Category…</option>
              <option value="diamond">Diamond</option>
              <option value="colored_stone">Colored stone</option>
              <option value="melee">Melee</option>
              <option value="other">Other</option>
            </select>
            <input name="shape" placeholder="Shape / cut (e.g. Princess, RD)" className="fc text-sm" />
            <input name="colorGrade" placeholder="Color (e.g. G, FANCY)" className="fc text-sm" />
            <input name="clarityGrade" placeholder="Clarity (e.g. VS1)" className="fc text-sm" />
            <input name="carat" type="number" step="0.001" placeholder="Weight (ct)" className="fc text-sm" />
            <select name="sourcing" className="fc text-sm">
              <option value="">Loose / certified…</option>
              <option value="loose">Loose</option>
              <option value="certified">Certified</option>
            </select>
            <input name="certificateNumber" placeholder="Certificate #" className="fc text-sm" />
            <input name="certificateLab" placeholder="Lab (GIA, IGI…)" className="fc text-sm" />
            <input name="supplier" placeholder="Supplier / memo party" className="fc text-sm" />
            <input name="cost" type="number" step="0.01" placeholder="Cost (USD)" className="fc text-sm" />
            <select name="memoAssetId" className="md:col-span-2 fc">
              <option value="">Memo photo (optional)…</option>
              {product.assets
                .filter((a) => a.type === "memo" && a.mimeType.startsWith("image/"))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.originalName}
                  </option>
                ))}
            </select>
            <textarea
              name="notes"
              placeholder="Notes"
              className="md:col-span-2 fc w-full"
              rows={2}
            />
            <button
              type="submit"
              className="btn btn-g md:col-span-2 w-full"
            >
              Add stone line
            </button>
          </form>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text2)]">
            {product.stones.map((s) => (
              <li key={s.id} className="lgb-row flex justify-between gap-2 px-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-[var(--peacock)]">{s.itemCategory ?? "—"}</span> · {s.shape ?? "—"} ·{" "}
                  {s.colorGrade ?? "—"} / {s.clarityGrade ?? "—"} · {s.carat ?? "?"} ct ·{" "}
                  {s.sourcing ?? "—"}
                  {s.certificateNumber ? ` · cert ${s.certificateNumber}` : ""}
                  {s.supplier ? ` · ${s.supplier}` : ""}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-rose-300 hover:underline"
                  onClick={async () => {
                    await fetch(`/api/stones/${s.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="lgb-section">
          <h2>Setter / findings</h2>
          <form
            className="mt-3 space-y-2 text-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              try {
                const res = await fetch(`/api/products/${id}/findings`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    description: fd.get("description"),
                    sourceShop: fd.get("sourceShop") || null,
                    cost: Number(fd.get("cost")),
                    invoiceRef: fd.get("invoiceRef") || null,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                await load();
                (e.currentTarget as HTMLFormElement).reset();
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <input name="description" placeholder="Description (tongue, lock…)" className="fc w-full" required />
            <input name="sourceShop" placeholder="Purchased at" className="fc w-full" />
            <input name="cost" type="number" step="0.01" placeholder="Cost" className="fc w-full" required />
            <input name="invoiceRef" placeholder="Invoice ref" className="fc w-full" />
            <button type="submit" className="btn btn-g w-full">
              Add finding
            </button>
          </form>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text2)]">
            {product.findings.map((f) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span>
                  {f.description} · {(f.costCents / 100).toFixed(2)}
                  {f.sourceShop ? ` · ${f.sourceShop}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-rose-300 hover:underline"
                  onClick={async () => {
                    await fetch(`/api/findings/${f.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lgb-section">
        <h2>Activity</h2>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs lgb-muted">
          {product.activityLogs.map((a) => (
            <li key={a.id}>
              <span className="lgb-muted">{new Date(a.createdAt).toLocaleString()}</span> ·{" "}
              {a.action}
              {a.payloadJson ? (
                <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-[var(--text3)]">
                  {a.payloadJson}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
