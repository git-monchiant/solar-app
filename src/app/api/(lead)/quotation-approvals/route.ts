import {NextRequest,NextResponse} from "next/server";
import {getDb,fixDates} from "@/lib/db";
import {requireAnyRole} from "@/lib/auth";
export async function GET(req:NextRequest){const gate=await requireAnyRole(req,["admin","sales_sup"]);if(gate.error)return gate.error;const db=await getDb();const r=await db.request().query(`SELECT q.id,q.doc_no,q.option_no,q.package_name_snapshot,q.contract_total_incl_vat,q.submitted_at,l.id lead_id,l.full_name customer_name,u.full_name submitted_by_name FROM quotations q JOIN leads l ON l.id=q.lead_id LEFT JOIN users u ON u.id=q.submitted_by WHERE q.status='pending_approval' ORDER BY q.submitted_at,q.id`);return NextResponse.json(fixDates(r.recordset));}
