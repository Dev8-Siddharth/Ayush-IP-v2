export type Jurisdiction = 'India' | 'International';

export type FormulationCategory =
  | 'Unknown'
  | 'Classical Medicine'
  | 'Patent or Proprietary Medicine'
  | 'New Drug'
  | 'Phytopharmaceutical'
  | 'Ayurveda-Aahar / Nutraceutical'
  | 'Cosmetic';

export interface Citation {
  source: string;
  sectionRef?: string;
  description?: string;
  exactTextSnippet?: string;
  docCategory?: string;
  url?: string;
}

export interface AbsStep {
  title: string;
  status: 'REQUIRED' | 'EXEMPT' | 'RECOMMENDED';
  description: string;
  authority: string;
}

export interface AbsChecklistAnalysis {
  applies: boolean;
  biologicalResourcesDetected: string[];
  complianceSteps: AbsStep[];
  overallRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXEMPT';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  needsHumanEscalation?: boolean;
  isClassicalTKDL?: boolean;
  absChecklist?: AbsChecklistAnalysis;
}

export type OutputLanguage =
  | 'Auto'
  | 'English'
  | 'Hindi'
  | 'Marathi'
  | 'Tamil'
  | 'Telugu'
  | 'Kannada'
  | 'Malayalam'
  | 'Gujarati'
  | 'Bengali'
  | 'Sanskrit';

export interface LanguageOption {
  code: OutputLanguage;
  label: string;
  nativeLabel: string;
}

export const OUTPUT_LANGUAGES: LanguageOption[] = [
  { code: 'Auto', label: 'Auto (Match Input)', nativeLabel: 'Auto' },
  { code: 'English', label: 'English', nativeLabel: 'English' },
  { code: 'Hindi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'Marathi', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'Tamil', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'Telugu', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'Kannada', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'Malayalam', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'Gujarati', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'Bengali', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'Sanskrit', label: 'Sanskrit', nativeLabel: 'संस्कृतम्' },
];

export interface AppState {
  jurisdiction: Jurisdiction;
  formulationCategory: FormulationCategory;
  textOutputLanguage: OutputLanguage;
}

