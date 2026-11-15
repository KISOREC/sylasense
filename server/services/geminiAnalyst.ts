import { GoogleGenAI, Type } from '@google/genai';
import type { AnalystStructuredResponse, SystemSnapshot } from '../../src/types/sylvasense.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function querySylvaAnalyst(params: {
  question: string;
  regionId?: string;
  alertId?: string;
  snapshot: SystemSnapshot;
}): Promise<AnalystStructuredResponse> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Configure the secret in Settings > Secrets to enable Sylva Intelligence Analyst.'
    );
  }

  const { question, regionId, alertId, snapshot } = params;

  const focusedRegion = regionId
    ? snapshot.regions.find((r) => r.id === regionId)
    : undefined;
  const focusedAlert = alertId
    ? snapshot.alerts.find((a) => a.id === alertId)
    : undefined;

  const groundedContext = {
    dataProvenanceDisclaimer: snapshot.demoNotice,
    summary: snapshot.summary,
    riskWeights: snapshot.riskWeights,
    focusedRegionId: focusedRegion?.id ?? null,
    focusedAlertId: focusedAlert?.id ?? null,
    regions: snapshot.regions.map((r) => {
      const veg = snapshot.vegetationIndices.find((v) => v.regionId === r.id);
      const risk = snapshot.assessments.find((a) => a.regionId === r.id);
      const sigs = snapshot.signals.filter((s) => s.regionId === r.id);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        state: r.state,
        district: r.district,
        areaHectares: r.areaHectares,
        centerCoordinates: [r.centerLat, r.centerLng],
        assignedOfficer: r.assignedOfficer,
        vegetationChange: veg
          ? {
              previousDate: veg.previousDate,
              currentDate: veg.currentDate,
              previousNdvi: veg.previousNdvi,
              currentNdvi: veg.currentNdvi,
              deltaNdvi: veg.deltaNdvi,
              changePercent: veg.changePercent,
              persistencePasses: veg.persistencePasses,
              affectedAreaHectares: veg.affectedAreaHectares,
            }
          : null,
        riskAssessment: risk
          ? {
              riskScore: risk.riskScore,
              classification: risk.classification,
              confidence: risk.confidence,
              isConfirmedIncident: risk.isConfirmedIncident,
              explanation: risk.explanation,
              supportingObservations: risk.supportingObservations,
              missingEvidence: risk.missingEvidence,
              suggestedVerificationAction: risk.suggestedVerificationAction,
            }
          : null,
        signals: sigs.map((s) => ({
          category: s.category,
          label: s.label,
          measuredValue: s.measuredValue,
          unit: s.unit,
          availabilityStatus: s.availabilityStatus,
          dataQuality: s.dataQuality,
          confidence: s.confidence,
          source: s.source,
        })),
      };
    }),
    alerts: snapshot.alerts,
    evidence: snapshot.evidence,
  };

  const systemInstruction = `You are the "Sylva Intelligence Analyst", an evidence-grounded environmental intelligence assistant for SYLVASENSE (Western Ghats Forest Monitoring Platform).

STRICT GROUNDING RULES:
1. You must ONLY reference coordinates, NDVI values, risk scores, weather readings, acoustic observations, regions, and alerts explicitly present in the supplied JSON context.
2. NEVER invent satellite acquisitions, sensor readings, coordinates, or confirmed illegal logging incidents.
3. Explicitly distinguish statistical disturbance risk ("High priority", "Critical priority") from ground-verified incidents. Never assert illegal logging is confirmed unless isConfirmedIncident is true AND supporting verified field evidence exists.
4. Explicitly state missing data or cloud occlusion caveats whenever relevant (for example, offline sensors in Anamalai or cloud-masked passes in Periyar).
5. Keep the response concise, analytical, and directly actionable for a forest officer or environmental researcher.`;

  const prompt = `ANALYST REQUEST:
${question}

GROUNDED SYLVASENSE APPLICATION DATA (JSON):
${JSON.stringify(groundedContext)}`;

  const modelName = 'gemini-4-hydrogen';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description: 'Clear, factual executive answer grounded strictly in the provided data.',
          },
          keyFindings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Bullet-level empirical findings citing exact metrics and region codes.',
          },
          evidenceCitations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceType: { type: Type.STRING },
                referenceId: { type: Type.STRING },
                detail: { type: Type.STRING },
              },
              required: ['sourceType', 'referenceId', 'detail'],
            },
            description: 'Specific regions, alerts, signals, or evidence IDs cited.',
          },
          missingDataCaveats: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Gaps, cloud occlusion, missing sensors, or demo-data disclaimers.',
          },
          recommendedNextSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Concrete field verification or GIS steps for forest officers.',
          },
          confidenceStatement: {
            type: Type.STRING,
            description: 'Explicit statement on assessment confidence and unconfirmed incident boundary.',
          },
        },
        required: [
          'answer',
          'keyFindings',
          'evidenceCitations',
          'missingDataCaveats',
          'recommendedNextSteps',
          'confidenceStatement',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Omit<
    AnalystStructuredResponse,
    'modelUsed' | 'generatedAt'
  >;

  return {
    ...parsed,
    modelUsed: modelName,
    generatedAt: new Date().toISOString(),
  };
}
