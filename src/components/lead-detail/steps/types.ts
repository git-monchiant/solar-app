export interface Lead {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  package_name: string;
  package_price: number;
  house_number: string;
  customer_type: string;
  status: string;
  source: string;
  note: string;
  contact_date: string;
  next_follow_up: string | null;
  payment_method: string | null;
  payment_type: string | null;
  finance_status: string | null;
  requirement: string | null;
  assigned_staff: string | null;
  booking_id: number | null;
  booking_number: string | null;
  booking_price: number | null;
  slip_url: string | null;
  payment_confirmed: boolean;
  confirmed: boolean;
  lost_reason: string | null;
  revisit_date: string | null;
  created_at: string;
  survey_date: string | null;
  monthly_bill: number | null;
  electrical_phase: string | null;
  wants_battery: string | null;
  roof_shape: string | null;
  appliances: string | null;
  ac_units: string | null;
  peak_usage: string | null;
  primary_reason: string | null;
}

export interface Package {
  id: number;
  name: string;
  kwp: number;
  phase: number;
  has_battery: boolean;
  battery_kwh: number;
  battery_brand: string;
  solar_panels: number;
  panel_watt: number;
  inverter_kw: number;
  inverter_brand: string;
  price: number;
  monthly_installment: string;
  monthly_saving: number;
  warranty_years: number;
}

export type CardStateKind = "done" | "active" | "locked";

export interface StepCommonProps {
  lead: Lead;
  state: CardStateKind;
  refresh: () => void;
}
