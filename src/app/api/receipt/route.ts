import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { jsPDF } from "jspdf";

const COMPANY = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  nameTh: "บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด",
  address: "448 Thanyalakpak Bldg., Soi Ratchadaphisek 26,",
  address2: "Ratchadaphisek Rd., Sam Sen Nok, Huai Khwang, Bangkok 10310",
  phone: "02-541-4642",
  website: "senasolarenergy.com",
};

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);
}

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("booking_id");
  if (!bookingId) return NextResponse.json({ error: "Missing booking_id" }, { status: 400 });

  try {
    const db = await getDb();
    const result = await db.request().input("id", sql.Int, parseInt(bookingId)).query(`
      SELECT b.*, l.full_name, l.phone, l.house_number, l.payment_type,
             p.name as package_name, p.kwp, p.has_battery, p.battery_kwh,
             pr.name as project_name
      FROM bookings b
      JOIN leads l ON b.lead_id = l.id
      JOIN packages p ON b.package_id = p.id
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE b.id = @id
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const b = result.recordset[0];
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(30, 208, 199); // primary color
    doc.rect(0, 0, w, 35, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(COMPANY.name, w / 2, 15, { align: "center" });
    doc.setFontSize(9);
    doc.text(`${COMPANY.address} ${COMPANY.address2}`, w / 2, 22, { align: "center" });
    doc.text(`Tel: ${COMPANY.phone} | ${COMPANY.website}`, w / 2, 28, { align: "center" });

    // Title
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(16);
    doc.text("PAYMENT RECEIPT", w / 2, 50, { align: "center" });

    // Receipt info
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Receipt No: ${b.booking_number}`, 20, 62);
    doc.text(`Date: ${new Date(b.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}`, w - 20, 62, { align: "right" });

    // Divider
    doc.setDrawColor(220, 220, 220);
    doc.line(20, 67, w - 20, 67);

    // Customer info
    let y = 77;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.text("Customer Information", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);

    const info = [
      ["Name", b.full_name],
      ["Phone", b.phone || "-"],
      ["Project", b.project_name || "-"],
      ["House No.", b.house_number || "-"],
    ];
    for (const [label, value] of info) {
      doc.setTextColor(140, 140, 140);
      doc.text(label, 25, y);
      doc.setTextColor(30, 30, 30);
      doc.text(String(value), 70, y);
      y += 7;
    }

    // Divider
    y += 3;
    doc.line(20, y, w - 20, y);
    y += 10;

    // Package details
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("Package Details", 20, y);
    y += 10;

    // Table header
    doc.setFillColor(245, 245, 245);
    doc.rect(20, y - 5, w - 40, 8, "F");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Description", 25, y);
    doc.text("Amount (THB)", w - 25, y, { align: "right" });
    y += 10;

    // Package row
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    let pkgDesc = `Solar Rooftop ${b.package_name}`;
    if (b.has_battery) pkgDesc += ` + Battery ${b.battery_kwh} kWh`;
    doc.text(pkgDesc, 25, y);
    doc.text(formatPrice(b.total_price), w - 25, y, { align: "right" });
    y += 10;

    // Total
    doc.line(20, y, w - 20, y);
    y += 8;
    doc.setFontSize(12);
    doc.text("Total", 25, y);
    doc.setFontSize(14);
    doc.text(`${formatPrice(b.total_price)} THB`, w - 25, y, { align: "right" });
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text("(VAT Included)", w - 25, y, { align: "right" });

    // Payment info
    y += 15;
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const paymentLabels: Record<string, string> = { transfer: "Bank Transfer", credit_card: "Credit Card", green_loan: "Green Loan", home_equity: "Home Equity" };
    doc.text(`Payment Method: ${paymentLabels[b.payment_type] || b.payment_type || "-"}`, 25, y);
    y += 7;
    doc.text(`Status: ${b.payment_confirmed ? "Paid" : "Pending"}`, 25, y);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text("Thank you for choosing SENA SOLAR ENERGY", w / 2, 270, { align: "center" });
    doc.text("This is a computer-generated document. No signature required.", w / 2, 275, { align: "center" });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=receipt_${b.booking_number}.pdf`,
      },
    });
  } catch (error) {
    console.error("Receipt error:", error);
    return NextResponse.json({ error: "Failed to generate receipt" }, { status: 500 });
  }
}
