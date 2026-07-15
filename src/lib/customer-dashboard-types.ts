export type CountItem = { value: string; label: string; count: number };
export type CountSeries = { answered: number; items: CountItem[] };

export type CustomerDashboardFilters = {
  from: string;
  to: string;
  projectId: number | null;
  source: string;
  status: string;
};

export type CustomerDashboardData = {
  filters: {
    projects: { id: number; name: string }[];
    sources: { value: string; label: string }[];
    statuses: string[];
  };
  meta: {
    cohortLeads: number;
    respondents: number;
    completeEight: number;
    coveragePct: number;
    latestUpdatedAt: string | null;
    averageMonthlyBill: number | null;
    medianMonthlyBill: number | null;
    monthlyBillAnswered: number;
    decisionSoon: number;
  };
  summary: {
    customerGroups: CountSeries;
    salesGrades: CountSeries;
  };
  sections: {
    customerProfile: {
      residenceType: CountSeries;
      houseAge: CountSeries;
      roofShape: CountSeries;
      averageOccupants: number | null;
      occupantAnswered: number;
      withElderly: number;
      withKids: number;
      withPets: number;
    };
    energyProfile: {
      monthlyBill: { answered: number; average: number | null; median: number | null; items: CountItem[] };
      monthlyBillMaxAverage: number | null;
      electricalPhase: CountSeries;
      meterSize: CountSeries;
      peakUsage: CountSeries;
    };
    lifestyle: {
      homeAtDaytime: CountSeries;
      daytimeOccupants: CountSeries;
      workAtHome: CountSeries;
      businessType: CountSeries;
      workDaysPerWeek: CountSeries;
      acAnswered: number;
      acDayTotal: number;
      acNightTotal: number;
      evCharger: CountSeries;
      evChargePeriod: CountSeries;
    };
    futureHome: {
      fields: { key: string; label: string; series: CountSeries }[];
    };
    energySecurity: {
      outagePriorities: CountSeries;
      billRiseAction: CountSeries;
    };
    homeHealth: {
      fields: { key: string; label: string; series: CountSeries }[];
      anyRisk: number;
    };
    beyond: {
      fields: { key: string; label: string; series: CountSeries }[];
    };
    decision: {
      timeline: CountSeries;
      factors: {
        key: string;
        label: string;
        answered: number;
        average: number | null;
        scores: number[];
      }[];
    };
  };
};

export type CustomerDrilldownRow = {
  id: number;
  full_name: string;
  house_number: string | null;
  status: string;
  created_at: string;
  project_name: string | null;
  source: string | null;
  answer: string;
};
