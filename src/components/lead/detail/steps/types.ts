export interface Lead {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
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
  assigned_user_id: number | null;
  assigned_name: string | null;
  pre_package_id: number | null;
  pre_slip_url: string | null;
  pre_doc_no: string | null;
  pre_total_price: number | null;
  pre_booked_at: string | null;
  ca_number: string | null;
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
  line_display_name?: string | null;
  line_picture_url?: string | null;
  from_prospect?: boolean;
  survey_time_slot: string | null;
  survey_confirmed: boolean;
  survey_lat: number | null;
  survey_lng: number | null;
  zone: string | null;
  pre_residence_type: string | null;
  survey_note: string | null;
  survey_photos: string | null;
  survey_electrical_phase: string | null;
  survey_wants_battery: string | null;
  survey_panel_count: number | null;
  survey_monthly_bill: number | null;
  survey_appliances: string | null;
  // Must-have on-site
  survey_roof_material: string | null;
  survey_roof_orientation: string | null;
  survey_floors: number | null;
  survey_roof_area_m2: number | null;
  survey_meter_size: string | null;
  survey_db_distance_m: number | null;
  // Nice-to-have on-site
  survey_shading: string | null;
  survey_roof_tilt: number | null;
  // PDF — section 2 (Electrical)
  survey_voltage_ln: number | null;
  survey_voltage_ll: number | null;
  survey_mdb_brand: string | null;
  survey_mdb_model: string | null;
  survey_mdb_slots: string | null;
  survey_breaker_type: string | null;
  survey_panel_to_inverter_m: number | null;
  // PDF — section 3 (Roof structure)
  survey_roof_structure: string | null;
  survey_roof_width_m: number | null;
  survey_roof_length_m: number | null;
  // PDF — section 4 (Installation planning)
  survey_inverter_location: string | null;
  survey_wifi_signal: string | null;
  survey_access_method: string | null;
  // PDF — §5 Photo Checklist (named slots)
  survey_photo_building_url: string | null;
  survey_photo_roof_structure_url: string | null;
  survey_photo_mdb_url: string | null;
  survey_photo_inverter_point_url: string | null;
  // PDF §7 — recommended install size after walking the site
  survey_recommended_kw: number | null;
  // PDF §7 — customer signature
  survey_customer_signature_url: string | null;
  // Quotation
  quotation_note: string | null;
  quotation_files: string | null;
  quotation_amount: number | null;
  // Purchase
  order_total: number | null;
  order_pct_before: number | null;
  order_pct_after: number | null;
  order_before_paid: boolean;
  order_before_slip: string | null;
  order_after_paid: boolean;
  order_after_slip: string | null;
  install_date: string | null;
  install_time_slot: string | null;
  install_confirmed: boolean;
  install_photos: string | null;
  install_note: string | null;
  install_extra_note: string | null;
  install_extra_cost: number | null;
  install_customer_signature_url: string | null;
  install_completed_at: string | null;
  review_sent: boolean;
  review_rating: number | null;
  review_quality: number | null;
  review_service: number | null;
  review_punctuality: number | null;
  review_comment: string | null;
  // Warranty (step 06)
  warranty_inverter_sn: string | null;
  warranty_doc_no: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_issued_at: string | null;
  warranty_doc_url: string | null;
  warranty_customer_signature_url: string | null;
  warranty_inverter_cert_url: string | null;
  warranty_panel_cert_url: string | null;
  warranty_panel_serials_url: string | null;
  warranty_other_docs_url: string | null;
  warranty_system_size_kwp: number | null;
  warranty_panel_count: number | null;
  warranty_panel_watt: number | null;
  warranty_panel_brand: string | null;
  warranty_inverter_brand: string | null;
  warranty_inverter_kw: number | null;
  warranty_battery_brand: string | null;
  warranty_battery_kwh: number | null;
  warranty_has_battery: boolean | null;
  warranty_inverter_sn_photo_url: string | null;
  warranty_batteries: string | null;
  // Sheet-sync fields (migration 096) — mirror Solar Sales Lead Database
  customer_code: string | null;
  project_note: string | null;
  customer_interest: string | null;
  seeker_type: string | null;
  seeker_name: string | null;
  home_loan_status: string | null;
  survey_actual_date: string | null;
  survey_actual_by: string | null;
  quotation_by: string | null;
  quotation_doc_no: string | null;
  quotation_sent_date: string | null;
  finance_bank: string | null;
  finance_months: number | null;
  finance_monthly: number | null;
  finance_loan_bank: string | null;
  finance_loan_amount: number | null;
  finance_documents: string | null;
  install_actual_date: string | null;
  house_number: string | null;
  survey_doc_no: string | null;
  // Grid-tie / ขอขนานไฟ (step 07)
  grid_utility: string | null;
  grid_app_no: string | null;
  grid_erc_submitted_date: string | null;
  grid_submitted_date: string | null;
  grid_inspection_date: string | null;
  grid_approved_date: string | null;
  grid_meter_changed_date: string | null;
  grid_permit_doc_url: string | null;
  grid_note: string | null;
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
  is_upgrade: boolean;
  has_panel: boolean;
  has_inverter: boolean;
  warranty_years: number;
}

export type CardStateKind = "done" | "active" | "locked";

export interface StepCommonProps {
  lead: Lead;
  state: CardStateKind;
  refresh: () => Promise<unknown> | void;
}
