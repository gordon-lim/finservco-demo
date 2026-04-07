import type { RiskAssessment } from '../../../../packages/common/src/types';

// In-memory store for risk assessments
// MISSING FEATURE (Issue #17): These assessments are lost on restart
// For SOX/PCI compliance, they need to be persisted to durable storage
const assessments: Map<string, RiskAssessment> = new Map();

export function storeAssessment(assessment: RiskAssessment): void {
  assessments.set(assessment.transactionId, assessment);
}

export function getAssessment(transactionId: string): RiskAssessment | undefined {
  return assessments.get(transactionId);
}

export function getHighRiskAssessments(): RiskAssessment[] {
  return Array.from(assessments.values()).filter(
    (a) => a.riskLevel === 'high' || a.riskLevel === 'critical'
  );
}

export function getAssessmentCount(): number {
  return assessments.size;
}
