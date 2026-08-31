import React from 'react';
import { AppState, Jurisdiction, FormulationCategory } from '../types';
import { BookOpen, ShieldCheck, Download, RefreshCw, Globe, ChevronDown, FileText, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AyushLogo } from './AyushLogo';

interface TopNavbarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenAbs: () => void;
  onOpenCitations: () => void;
  onClearChat: () => void;
  onExportPDF: () => void;
  onExportText: () => void;
  totalCitationsCount: number;
  activeLanguage: string;
}

export function TopNavbar({
  state,
  setState,
  onOpenAbs,
  onOpenCitations,
  onClearChat,
  onExportPDF,
  onExportText,
  totalCitationsCount,
  activeLanguage,
}: TopNavbarProps) {
  const [isExportOpen, setIsExportOpen] = React.useState(false);

  return (
    <header className="w-full bg-white border-b border-[#E5E0D8] shrink-0 z-30 shadow-2xs sticky top-0">
      {/* Primary Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <AyushLogo className="w-10 h-10 shadow-2xs" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#2D2A26] tracking-tight leading-none">
                AyushIP Portal
              </h1>
              <span className="bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium leading-none">
                SIH 2026 • PS 26045
              </span>
            </div>
            <p className="text-[11.5px] text-[#5C554E] font-medium mt-0.5">
              Ayurvedic IP & Regulatory Intelligence •{' '}
              <span className="text-[#C86D28] font-semibold">National Ayush Mission</span>
            </p>
          </div>
        </div>

        {/* Center: Multilingual Pill */}
        <div className="hidden lg:flex items-center gap-2 bg-[#FAF3E8] border border-[#E8DEC8] px-3.5 py-1 rounded-full text-xs text-[#5C554E] font-sans">
          <Globe className="w-3.5 h-3.5 text-[#2E7D32] shrink-0" />
          <span>
            <strong className="text-[#2D2A26] font-medium">Indic Multilingual:</strong> हिंदी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, मराठी, ગુજરાતી, EN
          </span>
        </div>

        {/* Right: Badges & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Grounded Corpus Verified Badge */}
          <div className="hidden sm:flex items-center gap-1.5 bg-white border border-[#E2DAD0] px-3 py-1 rounded-full text-xs text-[#2E7D32] font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#2E7D32] animate-pulse" />
            <span>Grounded Corpus Verified</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#2E7D32]" />
          </div>

          {/* ABS Compliance Modal Trigger */}
          <button
            onClick={onOpenAbs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF3E8] hover:bg-[#E8DEC8]/60 text-[#2D2A26] border border-[#E8DEC8] transition-colors cursor-pointer"
            title="Open ABS Compliance Checklist"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span className="hidden md:inline">ABS Checklist</span>
          </button>

          {/* Statutory Sources Button */}
          <button
            onClick={onOpenCitations}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#E8DEC8] hover:border-[#2E7D32]/50 hover:bg-[#E8F5E9]/40 text-[#2D2A26] transition-colors shadow-2xs cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span>Sources</span>
            {totalCitationsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] font-mono font-bold">
                {totalCitationsCount}
              </span>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#E8833A] hover:bg-[#D47029] text-white shadow-2xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            <AnimatePresence>
              {isExportOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-56 bg-white border border-[#E8DEC8] rounded-xl shadow-xl py-2 z-50 text-xs font-sans"
                >
                  <div className="px-3 py-1 text-[10px] font-mono text-[#6C6661] uppercase tracking-wider border-b border-[#E8DEC8] mb-1 font-semibold">
                    Official Export Dossier
                  </div>
                  <button
                    onClick={() => {
                      onExportPDF();
                      setIsExportOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#2D2A26] hover:bg-[#FAF3E8] transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#E8833A]" />
                    <div>
                      <div className="font-semibold">Export as PDF (.pdf)</div>
                      <div className="text-[10px] text-[#6C6661] font-mono">Formatted official report</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      onExportText();
                      setIsExportOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#2D2A26] hover:bg-[#FAF3E8] transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-[#2E7D32]" />
                    <div>
                      <div className="font-semibold">Export as Text (.txt)</div>
                      <div className="text-[10px] text-[#6C6661] font-mono">Plaintext dossier file</div>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Sub-Header: Retrieval Filters Bar */}
      <div className="bg-[#FAF6EF] border-t border-[#E8DEC8] px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Left: Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#6C6661] font-mono font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 mr-1">
              🌱 RETRIEVAL FILTERS:
            </span>

            {/* Jurisdiction Filters */}
            <button
              onClick={() => setState(s => ({ ...s, jurisdiction: 'India' }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                state.jurisdiction === 'India'
                  ? 'bg-[#2E7D32] text-white shadow-2xs border border-[#1B5E20]'
                  : 'bg-[#FAF3E8] text-[#5C554E] hover:bg-white border border-[#E8DEC8]'
              }`}
            >
              🇮🇳 India (National)
            </button>

            <button
              onClick={() => setState(s => ({ ...s, jurisdiction: 'International' }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                state.jurisdiction === 'International'
                  ? 'bg-[#2E7D32] text-white shadow-2xs border border-[#1B5E20]'
                  : 'bg-[#FAF3E8] text-[#5C554E] hover:bg-white border border-[#E8DEC8]'
              }`}
            >
              🌐 International (PCT/Nagoya)
            </button>

            {/* Category Filters */}
            <button
              onClick={() => setState(s => ({
                ...s,
                formulationCategory: s.formulationCategory === 'Classical Medicine' ? 'Unknown' : 'Classical Medicine'
              }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                state.formulationCategory === 'Classical Medicine'
                  ? 'bg-[#C86D28] text-white border border-[#A05217] shadow-2xs'
                  : 'bg-[#FAF3E8] text-[#5C554E] hover:bg-white border border-[#E8DEC8]'
              }`}
            >
              🍵 Classical (Samhita / AFI)
            </button>

            <button
              onClick={() => setState(s => ({
                ...s,
                formulationCategory: s.formulationCategory === 'Patent or Proprietary Medicine' ? 'Unknown' : 'Patent or Proprietary Medicine'
              }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                state.formulationCategory === 'Patent or Proprietary Medicine' || state.formulationCategory === 'New Drug'
                  ? 'bg-[#C86D28] text-white border border-[#A05217] shadow-2xs'
                  : 'bg-[#FAF3E8] text-[#5C554E] hover:bg-white border border-[#E8DEC8]'
              }`}
            >
              ✨ New / Proprietary Extract
            </button>
          </div>

          {/* Right: Active Lang & Clear Chat */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32]" />
              Active Lang: {activeLanguage}
            </span>

            <button
              onClick={onClearChat}
              className="flex items-center gap-1 text-xs text-[#5C554E] hover:text-[#2D2A26] px-2.5 py-1 hover:bg-[#E8DEC8]/50 rounded-lg transition-colors cursor-pointer font-medium"
              title="Clear current chat conversation"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear Chat</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
