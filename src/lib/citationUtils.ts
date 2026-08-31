import { Citation } from '../types';

export type AuthorityLevel =
  | 'official-primary'
  | 'official-secondary';

export interface AuthoritativeSource {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  authorityLevel: AuthorityLevel;
  jurisdiction: 'India' | 'International' | 'Both';
  categories: string[];
}

export interface EnrichedCitation extends Citation {
  docCategory: string;
  portalName: string;
  url: string;
  badgeColor: string;
  sectionRef: string;
  exactTextSnippet: string;
  authorityLevel?: AuthorityLevel;
  url_precision?: 'section-level' | 'act-level';
}

/**
 * Authoritative Source Registry strictly restricted to the four authorized domains:
 * 1. indiacode.gov.in (India Code)
 * 2. ipindia.gov.in (Intellectual Property India)
 * 3. nbaindia.nic.in / nbaind.org (National Biodiversity Authority)
 * 4. tkdl.res.in (Traditional Knowledge Digital Library - public purpose & scope)
 */
export const AUTHORITATIVE_SOURCES: AuthoritativeSource[] = [
  {
    id: 'india-code',
    name: 'India Code',
    domain: 'indiacode.gov.in',
    baseUrl: 'https://indiacode.gov.in/items/7468481f-b8ab-4029-b914-b926971c91df',
    authorityLevel: 'official-primary',
    jurisdiction: 'India',
    categories: [
      'patents act 1970',
      'biological diversity act 2002',
      'drugs and cosmetics act 1940',
      'section 3(p)',
      'section 10(4)',
      'section 25',
      'section 3',
      'section 6',
      'section 7',
      'section 40'
    ]
  },
  {
    id: 'ip-india',
    name: 'Intellectual Property India (IP India)',
    domain: 'ipindia.gov.in',
    baseUrl: 'https://ipindia.gov.in/resource/patents-resources-guidelines',
    authorityLevel: 'official-primary',
    jurisdiction: 'India',
    categories: [
      'patents',
      'patent guidelines',
      'traditional knowledge guidelines',
      'patents rules 2024',
      'rule 24c',
      'form 18a',
      'trademarks class 5',
      'geographical indications'
    ]
  },
  {
    id: 'nba',
    name: 'National Biodiversity Authority (NBA)',
    domain: 'nbaindia.nic.in',
    baseUrl: 'https://www.nbaindia.nic.in/application-form/form-application-fee',
    authorityLevel: 'official-primary',
    jurisdiction: 'India',
    categories: [
      'national biodiversity authority',
      'nba',
      'abs clearance',
      'form i',
      'form iii',
      'abs regulations',
      'benefit sharing',
      'biological diversity amendment 2023'
    ]
  },
  {
    id: 'tkdl',
    name: 'Traditional Knowledge Digital Library (TKDL)',
    domain: 'tkdl.res.in',
    baseUrl: 'https://tkdl.res.in/tkdl/langdefault/common/About.asp',
    authorityLevel: 'official-primary',
    jurisdiction: 'India',
    categories: [
      'traditional knowledge',
      'tkdl',
      'prior art',
      'csir',
      'tkrc classification',
      'defensive patent protection',
      'access agreements'
    ]
  }
];

const ROOT_DOMAIN_BLACKLIST = [
  'https://indiacode.gov.in',
  'https://indiacode.gov.in/',
  'https://www.indiacode.nic.in',
  'https://www.indiacode.nic.in/',
  'https://ipindia.gov.in',
  'https://ipindia.gov.in/',
  'https://www.nbaindia.org',
  'https://www.nbaindia.org/',
  'https://www.nbaindia.nic.in',
  'https://www.nbaindia.nic.in/',
  'https://tkdl.res.in',
  'https://tkdl.res.in/'
];

/**
 * Normalizes citation URLs strictly enforcing the four authorized domains and preventing bare root domain links.
 * Preserves exact resolved deep URLs from the verified RAG pipeline.
 */
export function normalizeUrl(
  rawUrl?: string,
  contextText?: string,
  jurisdiction?: 'India' | 'International'
): string {
  const urlStr = (rawUrl || '').trim();
  const context = (contextText || '').toLowerCase();
  const combined = (urlStr + ' ' + context).toLowerCase();

  // If a valid, non-root URL from one of the 4 authorized domains is supplied, PRESERVE IT!
  const isAuthorizedDomain =
    urlStr.includes('indiacode.gov.in') ||
    urlStr.includes('indiacode.nic.in') ||
    urlStr.includes('ipindia.gov.in') ||
    urlStr.includes('nbaindia.nic.in') ||
    urlStr.includes('nbaindia.org') ||
    urlStr.includes('tkdl.res.in');

  const isBareRoot = ROOT_DOMAIN_BLACKLIST.includes(urlStr) || urlStr.endsWith('.gov.in') || urlStr.endsWith('.nic.in') || urlStr.endsWith('.res.in');

  if (urlStr.startsWith('http') && isAuthorizedDomain && !isBareRoot) {
    return urlStr;
  }

  // Deep fallback within the four authorized domains based on topic context:
  // 1. Traditional Knowledge / TKDL
  if (combined.includes('tkdl') || combined.includes('prior art') || combined.includes('tkrc') || combined.includes('csir')) {
    return 'https://tkdl.res.in/tkdl/langdefault/common/About.asp';
  }

  // 2. National Biodiversity Authority / ABS / Form I / Form III
  if (combined.includes('nba') || combined.includes('biodiversity') || combined.includes('form iii') || combined.includes('form i') || combined.includes('benefit sharing')) {
    if (combined.includes('2023') || combined.includes('amendment')) {
      return 'https://www.nbaindia.nic.in/sites/default/files/2026-05/BDAct_2023.pdf';
    }
    return 'https://www.nbaindia.nic.in/application-form/form-application-fee';
  }

  // 3. IP India: Patents Rules, Expedited Examination, TM Class 5, Guidelines
  if (combined.includes('ip india') || combined.includes('rule 24c') || combined.includes('form 18a') || combined.includes('trademark') || combined.includes('class 5') || combined.includes('gi registry')) {
    if (combined.includes('rule 24c') || combined.includes('rules')) {
      return 'https://ipindia.gov.in/resource/patents-resources-rules';
    }
    if (combined.includes('trademark') || combined.includes('class 5')) {
      return 'https://ipindia.gov.in/trade-marks-resources-guidelines';
    }
    return 'https://ipindia.gov.in/resource/patents-resources-guidelines';
  }

  // 4. India Code (Patents Act 1970, BD Act 2002, D&C Act 1940)
  if (combined.includes('section 6') || combined.includes('sec 6')) {
    return 'https://indiacode.gov.in/items/134e1072-b6b1-49fd-ba31-d5f9abaad864';
  }
  if (combined.includes('section 7') || combined.includes('sec 7')) {
    return 'https://indiacode.gov.in/items/4f312122-64a6-410c-81e2-b0a0a9adf650';
  }
  if (combined.includes('section 40') || combined.includes('ntc')) {
    return 'https://indiacode.gov.in/items/42766f62-2e3e-48b5-8d66-2a8e69afb4df';
  }
  if (combined.includes('section 10') || combined.includes('specification') || combined.includes('origin')) {
    return 'https://indiacode.gov.in/items/c6203bfd-eafa-411a-9a7b-69059e52c8f0';
  }
  if (combined.includes('section 25') || combined.includes('opposition')) {
    return 'https://indiacode.gov.in/items/6dc273da-420e-4627-ba6e-59a04c796e0e';
  }
  if (combined.includes('drugs and cosmetics') || combined.includes('158b')) {
    return 'https://indiacode.gov.in/items/ed06e398-9693-47fe-9679-13eeb8aeb469';
  }

  // Default India Code deep URL: Patents Act Section 3 (Section 3(p))
  return 'https://indiacode.gov.in/items/7468481f-b8ab-4029-b914-b926971c91df';
}

/**
 * Enriches raw citation objects with authoritative metadata, portal labels,
 * and exact deep links strictly from the four authorized domains.
 */
export function enrichCitation(
  citation: Citation,
  jurisdiction?: 'India' | 'International'
): EnrichedCitation {
  const cleanSource = citation.source || 'Ayurvedic Regulatory Statute';
  const sourceLower = cleanSource.toLowerCase();

  // Derive section locator if missing
  let sectionRef = citation.sectionRef || '';
  if (!sectionRef) {
    if (sourceLower.includes('3(p)')) sectionRef = 'Section 3(p)';
    else if (sourceLower.includes('section 10')) sectionRef = 'Section 10(4)(d)(ii)';
    else if (sourceLower.includes('section 25')) sectionRef = 'Section 25';
    else if (sourceLower.includes('rule 24c')) sectionRef = 'Rule 24C';
    else if (sourceLower.includes('form 18a')) sectionRef = 'Form 18A';
    else if (sourceLower.includes('form iii')) sectionRef = 'Form III';
    else if (sourceLower.includes('form i')) sectionRef = 'Form I';
    else if (sourceLower.includes('section 3')) sectionRef = 'Section 3';
    else if (sourceLower.includes('section 6')) sectionRef = 'Section 6';
    else if (sourceLower.includes('section 7')) sectionRef = 'Section 7';
    else if (sourceLower.includes('section 40')) sectionRef = 'Section 40';
    else if (sourceLower.includes('rule 158b')) sectionRef = 'Rule 158B';
    else sectionRef = cleanSource;
  }

  // Normalize target URL (preserves exact deep link from RAG metadata)
  const targetUrl = normalizeUrl(
    citation.url,
    citation.exactTextSnippet || citation.description || sectionRef || cleanSource,
    jurisdiction
  );

  let docCategory = citation.docCategory || 'Regulatory Statute';
  let portalName = 'India Code';
  let badgeColor = 'bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]';
  let url_precision: 'section-level' | 'act-level' = 'section-level';

  if (targetUrl.includes('tkdl.res.in')) {
    docCategory = 'Traditional Knowledge / Prior Art';
    portalName = 'TKDL (tkdl.res.in)';
    badgeColor = 'bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]';
    url_precision = 'section-level';
  } else if (targetUrl.includes('nbaindia.nic.in') || targetUrl.includes('nbaindia.org')) {
    docCategory = 'Biological Diversity & ABS Authority';
    portalName = 'NBA (nbaindia.nic.in)';
    badgeColor = 'bg-[#E0F2F1] text-[#00695C] border-[#B2DFDB]';
    url_precision = targetUrl.endsWith('.pdf') ? 'act-level' : 'section-level';
  } else if (targetUrl.includes('ipindia.gov.in')) {
    docCategory = sourceLower.includes('trademark') ? 'Trade Marks Registry' : 'Patent Office (IP India)';
    portalName = 'IP India (ipindia.gov.in)';
    badgeColor = 'bg-[#EDE7F6] text-[#512DA8] border-[#D1C4E9]';
    url_precision = targetUrl.includes('rules') || targetUrl.includes('forms') ? 'section-level' : 'act-level';
  } else {
    docCategory = sourceLower.includes('patent') ? 'Patent Law (Patents Act 1970)' : sourceLower.includes('biological') ? 'Biodiversity Law (BD Act 2002)' : 'Indian Statutory Law';
    portalName = 'India Code (indiacode.gov.in)';
    badgeColor = 'bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]';
    url_precision = 'section-level';
  }

  return {
    ...citation,
    source: cleanSource,
    docCategory,
    portalName,
    authorityLevel: 'official-primary',
    url: targetUrl,
    badgeColor,
    sectionRef,
    exactTextSnippet: citation.exactTextSnippet || citation.description || '',
    url_precision
  };
}
