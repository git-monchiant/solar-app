import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/lib/db";
import {requireAuth} from "@/lib/auth";
export async function GET(req:NextRequest){const gate=await requireAuth(req);if(gate.error)return gate.error;const db=await getDb();const r=await db.request().query(`SELECT id,name,terms_json,is_default FROM quotation_payment_templates WHERE is_active=1 ORDER BY is_default DESC,id`);return NextResponse.json(r.recordset.map(x=>({...x,terms:JSON.parse(x.terms_json)})));}
