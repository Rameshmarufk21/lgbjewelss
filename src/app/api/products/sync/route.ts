import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseJsonSafe(str: string | null): Record<string, any> | null {
  if (!str) return null;
  try {
    if (str.startsWith("{") && str.endsWith("}")) {
      return JSON.parse(str);
    }
  } catch {}
  return null;
}

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        maker: true,
        assets: true,
        vendorInvoices: { include: { lines: true } },
        stones: true,
        findings: true,
      },
    });

    const mapped = products.map((p) => {
      const meta = parseJsonSafe(p.notes);
      const makerName = p.maker?.name || "";
      const pNorm = makerName.trim().toLowerCase();
      let company = meta?.company || "lgb";
      if (pNorm === "sagar") {
        company = "sakk";
      } else if (pNorm === "khushi" || pNorm === "kunal" || pNorm === "shweta") {
        company = "lgb";
      }
      const notes = meta ? meta.notes : p.notes;
      const extras = meta?.extras || [];
      const castPickup = meta?.castPickup || "";
      const castPickupDate = meta?.castPickupDate || "";
      const stoneLot = meta?.stoneLot || "";
      const stoneSieve = meta?.stoneSieve || "";
      const setJob = meta?.setJob || "";
      const setST = meta?.setST || "";
      const linkedOrderId = meta?.linkedOrderId || "";
      const size = meta?.size || "";
      const metal = meta?.metal || "";

      const castInv = p.vendorInvoices.find((i) =>
        ["mta casting hub", "carat"].includes(i.vendor.toLowerCase())
      );
      const setInv = p.vendorInvoices.find((i) =>
        ["victor", "jymp", "edwin", "mc production"].includes(i.vendor.toLowerCase())
      );

      const primaryStone = p.stones[0];
      const primaryPhoto = p.assets.find((a) => a.type === "photo");
      const primaryRender = p.assets.find((a) => a.type === "cad_render");

      return {
        id: p.id,
        company,
        styleCode: p.cadFilenameStem || "",
        productType: p.displayName || "Ring",
        metal,
        size,
        placedBy: p.maker?.name || "",
        status: p.status,
        notes: notes || "",
        createdAt: p.createdAt.toISOString().slice(0, 10),
        linkedOrderId,

        castVendor: castInv?.vendor || "",
        castInvoice: castInv?.invoiceNo || "",
        castDate: castInv?.invoiceDate ? castInv.invoiceDate.toISOString().slice(0, 10) : "",
        castDWT: castInv?.notes || "",
        castGrams: castInv?.goldWeightG ? String(castInv.goldWeightG) : "",
        castPrint: castInv?.otherChargesCents ? String(castInv.otherChargesCents / 100) : "",
        castTotal: castInv?.totalCents ? String(castInv.totalCents / 100) : "",
        castPickup,
        castPickupDate,

        stoneShape: primaryStone?.shape || "",
        stoneColor: primaryStone?.colorGrade || "",
        stoneSieve,
        stoneMM: primaryStone?.shape || "",
        stonePcs: primaryStone ? "1" : "",
        stoneCt: primaryStone?.carat ? String(primaryStone.carat) : "",
        stonePrice:
          primaryStone?.costCents && primaryStone.carat
            ? String(primaryStone.costCents / 100 / primaryStone.carat)
            : "",
        stoneTotal: primaryStone?.costCents ? String(primaryStone.costCents / 100) : "",
        stoneLot,
        stoneCert: primaryStone?.certificateNumber || "",

        setter: setInv?.vendor || "",
        setInvoice: setInv?.invoiceNo || "",
        setDate: setInv?.invoiceDate ? setInv.invoiceDate.toISOString().slice(0, 10) : "",
        setPrice: (setInv?.metalCostCents || setInv?.totalCents) ? String((setInv.metalCostCents || setInv.totalCents) / 100) : "",
        setLabor: "",
        setLaser: "",
        setTotal: (setInv?.metalCostCents || setInv?.totalCents) ? String((setInv.metalCostCents || setInv.totalCents) / 100) : "",
        setJob,
        setST,

        extras,
        imageUrl: primaryPhoto?.publicUrl || "",
        cardImageUrl: primaryRender?.publicUrl || "",
        imageUrls: p.assets.map((a) => a.publicUrl || a.storedPath),
        stones: p.stones.map((s) => ({
          category: s.itemCategory || "",
          shape: s.shape || "",
          colorGrade: s.colorGrade || "",
          clarityGrade: s.clarityGrade || "",
          carat: s.carat,
          sourcing: s.sourcing || "",
          certificateNumber: s.certificateNumber || "",
          certificateLab: s.certificateLab || "",
          supplier: s.supplier || "",
          cost: s.costCents ? s.costCents / 100 : null,
          notes: s.notes || "",
        })),
      };
    });

    return NextResponse.json({ ok: true, orders: mapped });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const incoming = Array.isArray(body.orders)
      ? body.orders
      : body.order
      ? [body.order]
      : [];
    if (!incoming.length) return NextResponse.json({ ok: true, count: 0 });

    for (const o of incoming) {
      if (!o || !o.id) continue;

      let makerId: string | null = null;
      if (o.placedBy) {
        const m = await prisma.maker.upsert({
          where: { name: o.placedBy },
          create: { name: o.placedBy },
          update: {},
        });
        makerId = m.id;
      }

      const pNorm = (o.placedBy || "").trim().toLowerCase();
      let companyVal = o.company || "lgb";
      if (pNorm === "sagar") {
        companyVal = "sakk";
      } else if (pNorm === "khushi" || pNorm === "kunal" || pNorm === "shweta") {
        companyVal = "lgb";
      }

      const notesValue = JSON.stringify({
        company: companyVal,
        notes: o.notes || "",
        extras: o.extras || [],
        castPickup: o.castPickup || "",
        castPickupDate: o.castPickupDate || "",
        stoneLot: o.stoneLot || "",
        stoneSieve: o.stoneSieve || "",
        setJob: o.setJob || "",
        setST: o.setST || "",
        linkedOrderId: o.linkedOrderId || "",
        size: o.size || "",
        metal: o.metal || "",
      });

      await prisma.product.upsert({
        where: { id: o.id },
        create: {
          id: o.id,
          displayName: o.productType || "Ring",
          cadFilenameStem: o.styleCode || "",
          status: o.status || "Inquiry",
          makerId,
          sellPriceCents: o.sellPrice ? Math.round(Number(o.sellPrice) * 100) : null,
          notes: notesValue,
          createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
        },
        update: {
          displayName: o.productType || "Ring",
          cadFilenameStem: o.styleCode || "",
          status: o.status || "Inquiry",
          makerId,
          sellPriceCents: o.sellPrice ? Math.round(Number(o.sellPrice) * 100) : null,
          notes: notesValue,
        },
      });

      if (o.castVendor) {
        const totalCents = o.castTotal ? Math.round(Number(o.castTotal) * 100) : 0;
        const existCast = await prisma.vendorInvoice.findFirst({
          where: { productId: o.id, vendor: o.castVendor },
        });

        const invData = {
          productId: o.id,
          vendor: o.castVendor,
          invoiceNo: o.castInvoice || "CAST",
          invoiceDate: o.castDate ? new Date(o.castDate) : null,
          totalCents,
          goldWeightG: o.castGrams ? Number(o.castGrams) : null,
          otherChargesCents: o.castPrint ? Math.round(Number(o.castPrint) * 100) : null,
          notes: o.castDWT || "",
        };

        if (existCast) {
          await prisma.vendorInvoice.update({ where: { id: existCast.id }, data: invData });
        } else {
          await prisma.vendorInvoice.create({ data: invData });
        }
      }

      if (o.setter) {
        const setCostVal = o.setPrice || o.setTotal || 0;
        const totalCents = Math.round(Number(setCostVal) * 100);
        const existSet = await prisma.vendorInvoice.findFirst({
          where: { productId: o.id, vendor: o.setter },
        });

        const invData = {
          productId: o.id,
          vendor: o.setter,
          invoiceNo: o.setInvoice || "SET",
          invoiceDate: o.setDate ? new Date(o.setDate) : null,
          totalCents,
          metalCostCents: o.setPrice ? Math.round(Number(o.setPrice) * 100) : null,
          laborCostCents: null,
          otherChargesCents: null,
        };

        if (existSet) {
          await prisma.vendorInvoice.update({ where: { id: existSet.id }, data: invData });
        } else {
          await prisma.vendorInvoice.create({ data: invData });
        }
      }

      await prisma.stoneAssignment.deleteMany({ where: { productId: o.id } });

      if (Array.isArray(o.stones) && o.stones.length) {
        for (const s of o.stones) {
          await prisma.stoneAssignment.create({
            data: {
              productId: o.id,
              itemCategory: s.category || "melee",
              shape: s.shape || null,
              colorGrade: s.colorGrade || null,
              clarityGrade: s.clarityGrade || null,
              carat: s.carat ? Number(s.carat) : null,
              sourcing: s.sourcing || null,
              certificateNumber: s.certificateNumber || null,
              certificateLab: s.certificateLab || null,
              supplier: s.supplier || null,
              costCents: s.cost ? Math.round(Number(s.cost) * 100) : null,
              notes: s.notes || null,
            },
          });
        }
      } else if (o.stoneShape || o.stoneCt) {
        await prisma.stoneAssignment.create({
          data: {
            productId: o.id,
            itemCategory: "diamond",
            shape: o.stoneShape || null,
            colorGrade: o.stoneColor || null,
            carat: o.stoneCt ? Number(o.stoneCt) : null,
            certificateNumber: o.stoneCert || null,
            costCents: o.stoneTotal ? Math.round(Number(o.stoneTotal) * 100) : null,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, count: incoming.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
