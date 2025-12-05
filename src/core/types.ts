export type ResidentId = string;
export type HospitalId = string;

export interface Resident {
  id: ResidentId;
  preferences: HospitalId[];
}

export interface Hospital {
  id: HospitalId;
  capacity: number;
  preferences: ResidentId[];
}

export interface MatchResult {
  residents: Record<ResidentId, HospitalId | undefined>;
  hospitals: Record<HospitalId, ResidentId[]>;
}
