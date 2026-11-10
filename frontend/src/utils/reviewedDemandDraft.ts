import type { RequirementDraft } from '../api/aiApi';

const STORAGE_KEY = 'markettwin_reviewed_demand_draft_v1';
const STORAGE_VERSION = 1;
const MAX_AGE_MS = 30 * 60 * 1000;

interface StoredReviewedDraft {
  version: number;
  savedAt: number;
  draft: RequirementDraft;
  originalRequirement: string;
  confirmed: true;
}

export interface ReviewedDemandDraft {
  draft: RequirementDraft;
  originalRequirement: string;
  confirmed: true;
}

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 32 && entries.every(
    ([key, item]) =>
      key.trim().length > 0 &&
      key.length <= 80 &&
      typeof item === 'string' &&
      item.trim().length > 0 &&
      item.length <= 500
  );
};

const isRequirementDraft = (value: unknown): value is RequirementDraft => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const validOptionalText = (item: unknown) =>
    item === null || (typeof item === 'string' && item.length <= 160);

  return (
    validOptionalText(draft.product_name) &&
    validOptionalText(draft.product_type) &&
    validOptionalText(draft.category) &&
    isStringRecord(draft.mandatory_requirements) &&
    isStringRecord(draft.optional_preferences) &&
    isStringRecord(draft.commercial_constraints) &&
    isStringRecord(draft.delivery_constraints)
  );
};

export const saveReviewedDemandDraft = (
  draft: RequirementDraft,
  originalRequirement: string,
  confirmed: boolean
): boolean => {
  if (
    !isRequirementDraft(draft) ||
    !confirmed ||
    typeof originalRequirement !== 'string' ||
    !originalRequirement.trim() ||
    originalRequirement.length > 2000
  ) {
    return false;
  }
  try {
    const stored: StoredReviewedDraft = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      draft,
      originalRequirement: originalRequirement.trim(),
      confirmed: true,
    };
    const serialized = JSON.stringify(stored);
    if (serialized.length > 20_000) return false;
    sessionStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
};

export const loadReviewedDemandDraft = (): ReviewedDemandDraft | null => {
  try {
    const serialized = sessionStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    if (serialized.length > 20_000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const stored: unknown = JSON.parse(serialized);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const candidate = stored as Partial<StoredReviewedDraft>;
    if (
      candidate.version !== STORAGE_VERSION ||
      typeof candidate.savedAt !== 'number' ||
      !Number.isFinite(candidate.savedAt) ||
      Date.now() - candidate.savedAt > MAX_AGE_MS ||
      candidate.savedAt > Date.now() ||
      candidate.confirmed !== true ||
      typeof candidate.originalRequirement !== 'string' ||
      !candidate.originalRequirement.trim() ||
      candidate.originalRequirement.length > 2000 ||
      !isRequirementDraft(candidate.draft)
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      draft: candidate.draft,
      originalRequirement: candidate.originalRequirement,
      confirmed: true,
    };
  } catch {
    clearReviewedDemandDraft();
    return null;
  }
};

export const clearReviewedDemandDraft = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage cleanup is best-effort; no sensitive credentials are stored here.
  }
};
