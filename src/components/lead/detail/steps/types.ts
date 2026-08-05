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
  customer_group: string | null;
  customer_grade: string | null;
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
  assigned_username?: string | null;
  pre_package_id: number | null;
  pre_slip_url: string | null;
  receipt_deposit_actual_url?: string | null;
  receipt_order_before_actual_url?: string | null;
  receipt_order_after_actual_url?: string | null;
  pre_doc_no: string | null;
  pre_total_price: number | null;
  pre_survey_fee_type: "free" | "normal";
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
  // questionnaire §1 — also on lead_data
  house_age: string | null;
  occupant_total: number | null;
  occupant_elderly: number | null;
  occupant_kids: number | null;
  occupant_pets: number | null;
  // questionnaire §2 — also on lead_data
  monthly_bill_max: number | null;
  meter_size: string | null;
  // questionnaire §3 — also on lead_data
  home_at_daytime: string | null;
  daytime_occupants: string | null;
  work_at_home: string | null;
  business_type: string | null;
  work_days_per_week: string | null;
  ac_split: string | null;
  ev_charge_period: string | null;
  // questionnaire §4 — also on lead_data
  future_ev: string | null;
  future_ev_charger: string | null;
  future_extend_home: string | null;
  future_more_members: string | null;
  future_smart_home: string | null;
  future_battery: string | null;
  // questionnaire §5 — energy security
  outage_priorities: string | null;
  bill_rise_action: string | null;
  // questionnaire §6 — home health check
  had_roof_leak: string | null;
  did_roof_repair: string | null;
  had_electrical_issue: string | null;
  did_panel_replacement: string | null;
  // questionnaire §7 — beyond question
  self_generates: string | null;
  ev_ready: string | null;
  blackout_resilient: string | null;
  future_usage_trend: string | null;
  // questionnaire §8 — decision making factor (JSON)
  decision_factors: string | null;
  decision_timeline: string | null;
  interested_package_id: number | null;
  interested_package_ids: string | null;
  package_note: string | null;
  pre_note: string | null;
  quotation_type: string | null;
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
  survey_photo_notes: string | null;
  survey_electrical_phase: string | null;
  survey_wants_battery: string | null;
  survey_panel_count: number | null;
  survey_customize_items: string | null;
  survey_monthly_bill: number | null;
  survey_appliances: string | null;
  // Must-have on-site
  survey_roof_material: string | null;
  survey_roof_orientation: string | null;
  survey_roof_orientation_notes: string | null;
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
  survey_main_breaker_amp: string | null;
  survey_main_cable_sqmm: string | null;
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
  survey_layout_sketch_url: string | null;
  // PDF §7 — recommended install size after walking the site
  survey_recommended_kw: number | null;
  // PDF §7 — customer signature
  survey_customer_signature_url: string | null;
  // Quotation
  quotation_note: string | null;
  // JSON: [{ url, doc_no, amount }, ...] up to 3 entries (legacy: bare CSV of URLs).
  quotation_files: string | null;
  // Index (0-based) into quotation_files JSON of the option the customer
  // accepted — set in OrderStep substep 1. quotation_amount + quotation_doc_no
  // are synced from the chosen entry once picked.
  quotation_accepted_idx: number | null;
  quotation_amount: number | null;
  // 'v1' = ระบบใบเสนอราคาเดิม (อัปโหลด PDF) · 'v2' = ระบบใหม่ (QuotationBuilder).
  // lead ใหม่ default 'v2'; lead ที่เคยออกใบเก่าถูก backfill เป็น 'v1' (migration 136).
  quotation_version: string | null;
  // Purchase
  order_total: number | null;
  order_discount_pct: number | null;
  order_discount_amount: number | null;
  order_discount_note: string | null;
  order_pct_before: number | null;
  order_pct_after: number | null;
  // JSON array of {pct: number, when: "before"|"after", due_date: string|null}.
  // Order is งวด 1, งวด 2, ... — last entry's pct = 100 - sum of earlier pcts.
  order_installments: string | null;
  // Count of order_installment_N payments confirmed by accounting — derived
  // by /api/leads + /api/leads/:id. Used to warn before re-basing the order
  // schedule when the customer switches to a different accepted quotation.
  order_paid_count?: number | null;
  order_before_paid: boolean;
  order_before_slip: string | null;
  order_after_paid: boolean;
  order_after_slip: string | null;
  install_date: string | null;
  install_date_end: string | null;
  install_time_slot: string | null;
  payment_followup_date: string | null;
  payment_followup_enabled: boolean;
  install_confirmed: boolean;
  install_photos: string | null;
  install_note: string | null;
  install_extra_note: string | null;
  install_extra_cost: number | null;
  install_customer_signature_url: string | null;
  install_completed_at: string | null;
  install_photos_extra: string | null;
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
  warranty_panel_model: string | null;
  install_checklist_doc_no: string | null;
  warranty_inverter_brand: string | null;
  warranty_inverter_kw: number | null;
  warranty_electrical_phase: string | null;
  payment_reject_notes: string | null;
  warranty_battery_brand: string | null;
  warranty_battery_model: string | null;
  warranty_battery_kwh: number | null;
  warranty_duration_years: number | null;
  warranty_om_per_year: number | null;
  warranty_has_battery: boolean | null;
  /** true = ไม่ได้ติดตั้ง inverter ที่นี่ — inverter fields disabled + not required. */
  warranty_no_inverter: boolean | null;
  warranty_inverter_sn_photo_url: string | null;
  warranty_batteries: string | null;
  warranty_panel_serials: string | null;
  /** JSON evidence grouped by inverters/panels/batteries; excluded from PDF. */
  warranty_evidence_photos: string | null;
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
  grid_applicant_type: string | null;
  grid_document_checklist: string | null;
  grid_application_doc_url: string | null;
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
  inverter_kw: number;
  inverter_brand: string;
  price: number;
  monthly_installment: string;
  monthly_saving: number;
  is_upgrade: boolean;
  is_other: boolean;
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
