export interface Lead {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  package_name: string;
  package_price: number;
  installation_address: string;
  customer_type: string;
  status: string;
  source: string;
  note: string;
  contact_date: string;
  next_follow_up: string | null;
  payment_type: string | null;
  finance_status: string | null;
  requirement: string | null;
  assigned_staff: string | null;
  booking_id: number | null;
  booked_package_id: number | null;
  booking_date: string | null;
  booking_number: string | null;
  booking_price: number | null;
  slip_url: string | null;
  payment_confirmed: boolean;
  id_card_number: string | null;
  id_card_address: string | null;
  id_card_photo_url: string | null;
  house_reg_photo_url: string | null;
  meter_number: string | null;
  confirmed: boolean;
  lost_reason: string | null;
  revisit_date: string | null;
  created_at: string;
  survey_date: string | null;
  pre_monthly_bill: number | null;
  pre_electrical_phase: string | null;
  pre_wants_battery: string | null;
  pre_roof_shape: string | null;
  pre_appliances: string | null;
  pre_ac_units: string | null;
  pre_peak_usage: string | null;
  pre_primary_reason: string | null;
  pre_bill_photo_url: string | null;
  interested_package_id: number | null;
  interested_package_ids: string | null;
  line_id: string | null;
  survey_time_slot: string | null;
  survey_confirmed: boolean;
  pre_residence_type: string | null;
  survey_note: string | null;
  survey_photos: string | null;
  survey_inverter: string | null;
  survey_electrical_phase: string | null;
  survey_wants_battery: string | null;
  survey_battery_kwh: number | null;
  survey_panel_id: number | null;
  survey_panel_count: number | null;
  // Survey duplicates of pre_*
  survey_residence_type: string | null;
  survey_monthly_bill: number | null;
  survey_peak_usage: string | null;
  survey_appliances: string | null;
  survey_ac_units: string | null;
  // Must-have on-site
  survey_roof_material: string | null;
  survey_roof_orientation: string | null;
  survey_floors: number | null;
  survey_roof_area_m2: number | null;
  survey_grid_type: string | null;
  survey_utility: string | null;
  survey_ca_number: string | null;
  survey_meter_size: string | null;
  survey_db_distance_m: number | null;
  // Nice-to-have on-site
  survey_shading: string | null;
  survey_roof_age: string | null;
  survey_roof_tilt: number | null;
}

export interface Panel {
  id: number;
  brand: string;
  model: string | null;
  watt: number;
  tier: string | null;
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
