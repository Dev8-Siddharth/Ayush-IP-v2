import React from 'react';
import { AppState, FormulationCategory, Jurisdiction } from '../types';
import { FileText, Pill, BookOpen, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface WizardProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenAbs: () => void;
}

const CATEGORIES: { label: FormulationCategory; desc: string; badge?: string }[] = [
  { label: 'Unknown', desc: 'General Ayurvedic IP & regulatory query' },
  { label: 'Classical Medicine', desc: 'First-Schedule authoritative texts (TKDL Grounded)', badge: 'TKDL BACKED' },
  { label: 'Patent or Proprietary Medicine', desc: 'Branded formulations derived from traditional texts' },
  { label: 'New Drug', desc: 'Novel botanical entity requiring clinical safety proof' },
  { label: 'Phytopharmaceutical', desc: 'Standardized purified botanical extract fraction' },
  { label: 'Ayurveda-Aahar / Nutraceutical', desc: 'FSSAI dietary & food safety regulation' },
  { label: 'Cosmetic', desc: 'Topical beauty, personal care & herbal cosmetics' },
];

export function Wizard({ state, setState, onOpenAbs }: WizardProps) {
  return (
    <motion.div 
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-80 bg-ayush-cream-light/90 border-r border-ayush-border h-screen flex flex-col p-5 overflow-y-auto shrink-0 shadow-xs"
    >
      <div className="pb-5 border-b border-ayush-border mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-md bg-ayush-green/10 border border-ayush-green/30 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-ayush-green-dark" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-ayush-dark uppercase font-mono">
              AyushIP Portal
            </h2>
            <p className="text-[11px] text-ayush-dark-muted font-mono">Ayurvedic IP & Regulatory Intelligence</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 flex-1">
        {/* Jurisdiction Section */}
        <section className="bg-white border border-ayush-border rounded-lg p-3.5 space-y-2.5 shadow-2xs">
          <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-ayush-dark flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-ayush-green-dark" />
            Target Jurisdiction
          </label>
          <div className="flex gap-1.5 p-1 bg-ayush-cream/50 border border-ayush-border rounded-md">
            {(['India', 'International'] as Jurisdiction[]).map((j) => (
              <button
                key={j}
                onClick={() => setState(s => ({ ...s, jurisdiction: j }))}
                className={`flex-1 px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wide rounded transition-all ${
                  state.jurisdiction === j
                    ? 'bg-ayush-green text-white shadow-2xs'
                    : 'text-ayush-dark-muted hover:text-ayush-dark hover:bg-white'
                }`}
              >
                {j}
              </button>
            ))}
          </div>
        </section>

        {/* Formulation Classification Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-ayush-dark flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-ayush-green-dark" />
              Formulation Category
            </label>
            <span className="text-[10px] font-mono font-bold text-ayush-green-dark bg-ayush-green-light px-2 py-0.5 rounded border border-ayush-green/30">
              {state.formulationCategory === 'Unknown' ? 'SELECT' : 'ACTIVE'}
            </span>
          </div>
          <p className="text-[11px] text-ayush-dark-muted leading-snug font-sans">
            Select formulation classification to apply specific patent, TKDL, and ABS legal frameworks.
          </p>
          
          <div className="space-y-2">
            {CATEGORIES.map((cat) => {
              const isSelected = state.formulationCategory === cat.label;
              return (
                <div
                  key={cat.label}
                  onClick={() => setState(s => ({ ...s, formulationCategory: cat.label }))}
                  className={`p-3 rounded-lg border cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'bg-ayush-green-light border-ayush-green text-ayush-dark shadow-2xs ring-1 ring-ayush-green/30'
                      : 'bg-white border-ayush-border hover:border-ayush-green/40 hover:bg-ayush-cream/20 text-ayush-dark-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-ayush-green bg-ayush-green' : 'border-ayush-border'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={`text-xs font-semibold ${isSelected ? 'text-ayush-dark font-bold' : 'text-ayush-dark'}`}>
                        {cat.label}
                      </span>
                    </div>

                    {cat.badge && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-ayush-brown-light text-ayush-brown border border-ayush-brown/30">
                        {cat.badge}
                      </span>
                    )}
                  </div>

                  {cat.desc && (
                    <p className="text-[11px] text-ayush-dark-muted mt-1.5 pl-6 leading-relaxed font-sans">
                      {cat.desc}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      
      {/* Footer Actions */}
      <div className="pt-4 border-t border-ayush-border flex flex-col gap-2 shrink-0">
        <button 
          onClick={onOpenAbs}
          className="flex justify-between items-center w-full text-xs font-mono font-bold tracking-wide text-ayush-green-dark hover:text-ayush-green transition-colors py-2 px-3 bg-white border border-ayush-green/30 hover:border-ayush-green/60 rounded-lg shadow-2xs"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-ayush-green" />
            ABS Rule Reference
          </span>
          <span className="bg-ayush-green-light text-ayush-green-dark px-1.5 py-0.5 rounded text-[10px]">AUTO</span>
        </button>

        <a 
          href="https://tkdl.res.in" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full text-xs font-mono font-bold tracking-wide text-ayush-brown hover:text-ayush-brown/80 transition-colors py-2 px-3 bg-white border border-ayush-brown/30 hover:border-ayush-brown/60 rounded-lg shadow-2xs"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-ayush-brown" />
            TKDL Database
          </span>
          <Sparkles className="w-3.5 h-3.5 text-ayush-lime" />
        </a>
      </div>
    </motion.div>
  );
}

