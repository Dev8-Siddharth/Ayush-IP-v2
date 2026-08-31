import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Circle, ShieldCheck, Leaf, AlertCircle, Info } from 'lucide-react';
import { FormulationCategory } from '../types';

interface AbsChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  formulationCategory: FormulationCategory;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  relevantFor: FormulationCategory[] | 'ALL';
  type: 'action' | 'info';
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'source-origin',
    title: 'Identify Source of Biological Resources',
    description: 'Confirm if biological resources (herbs, extracts) are sourced from India. If sourced externally and not endemic, ABS may not apply under the Indian Act, but documentation is required.',
    relevantFor: 'ALL',
    type: 'action'
  },
  {
    id: 'entity-status',
    title: 'Determine Entity Status (Section 3 vs. Section 7)',
    description: 'Are you a non-Indian individual, NRI, or an entity with non-Indian shareholding? (If yes, you need National Biodiversity Authority (NBA) approval. If purely Indian, State Biodiversity Board (SBB) intimation).',
    relevantFor: 'ALL',
    type: 'action'
  },
  {
    id: 'ntc-exemption',
    title: 'Check Normally Traded Commodities (NTC) Exemption',
    description: 'Verify if the raw materials are listed under the Section 40 NTC notification. If yes, and traded as commodities, they are exempt from ABS.',
    relevantFor: 'ALL',
    type: 'action'
  },
  {
    id: 'vap-exemption',
    title: 'Check Value Added Product (VAP) Status',
    description: 'Does the extract or formulation undergo sufficient physical/chemical change to be classed as a VAP? (Note: pure extraction often does not qualify as VAP without further processing).',
    relevantFor: ['Phytopharmaceutical', 'Patent or Proprietary Medicine', 'New Drug', 'Cosmetic', 'Ayurveda-Aahar / Nutraceutical'],
    type: 'action'
  },
  {
    id: 'classical-exemption',
    title: 'Classical Medicine Exemption Check',
    description: 'If manufacturing purely classical formulations (as per Schedule I books) without claiming new IP, you may be exempt from prior approval, but local SBB intimation and access fees might still apply depending on state rules.',
    relevantFor: ['Classical Medicine'],
    type: 'info'
  },
  {
    id: 'ip-approval',
    title: 'Form III for Intellectual Property',
    description: 'If you intend to file a patent for this formulation, you MUST apply to the NBA via Form III before the patent is granted.',
    relevantFor: ['Patent or Proprietary Medicine', 'New Drug', 'Phytopharmaceutical'],
    type: 'action'
  },
  {
    id: 'commercial-utilization',
    title: 'Form I / Form I-A for Commercial Utilization',
    description: 'File Form I (NBA) or Form I-A (SBB) prior to commencing commercial production or utilizing the resources for bio-survey/bio-utilization.',
    relevantFor: 'ALL',
    type: 'action'
  }
];

export function AbsChecklistModal({ isOpen, onClose, formulationCategory }: AbsChecklistModalProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setCheckedItems(new Set()), 300);
    }
  }, [isOpen]);

  const toggleCheck = (id: string) => {
    const newSet = new Set(checkedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCheckedItems(newSet);
  };

  const relevantItems = CHECKLIST_ITEMS.filter(item => 
    item.relevantFor === 'ALL' || item.relevantFor.includes(formulationCategory)
  );

  const actionableItems = relevantItems.filter(item => item.type === 'action');
  const progress = actionableItems.length > 0 
    ? Math.round((Array.from(checkedItems).filter(id => actionableItems.find(i => i.id === id)).length / actionableItems.length) * 100) 
    : 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ayush-dark/40 backdrop-blur-xs"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-2xl bg-white border border-ayush-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-ayush-border bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ayush-green-light border border-ayush-green/30 flex items-center justify-center">
                  <Leaf className="w-5 h-5 text-ayush-green-dark" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ayush-dark">ABS Compliance Checklist</h2>
                  <p className="text-xs font-mono text-ayush-dark-muted mt-0.5">Biological Diversity Act, 2002</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-ayush-dark-muted hover:text-ayush-dark hover:bg-ayush-cream transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 border-b border-ayush-border bg-ayush-cream-light shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-ayush-dark">
                  Target: <strong className="text-ayush-green-dark font-mono font-semibold ml-1">{formulationCategory}</strong>
                </span>
                <span className="text-sm font-mono font-bold text-ayush-green-dark">{progress}% Assessed</span>
              </div>
              <div className="h-2 w-full bg-ayush-border rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-ayush-green"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin bg-ayush-cream-light/30">
              {relevantItems.map((item, index) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => item.type === 'action' && toggleCheck(item.id)}
                  className={`flex gap-4 p-4 rounded-xl border transition-all ${
                    item.type === 'info'
                      ? 'bg-ayush-cream border-ayush-brown/30'
                      : checkedItems.has(item.id)
                        ? 'bg-ayush-green-light border-ayush-green/40 cursor-pointer shadow-2xs'
                        : 'bg-white border-ayush-border hover:border-ayush-green/40 cursor-pointer shadow-2xs'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {item.type === 'info' ? (
                      <Info className="w-5 h-5 text-ayush-brown" />
                    ) : checkedItems.has(item.id) ? (
                      <CheckCircle2 className="w-5 h-5 text-ayush-green-dark" />
                    ) : (
                      <Circle className="w-5 h-5 text-ayush-dark-muted" />
                    )}
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold mb-1 ${
                      item.type === 'info' ? 'text-ayush-brown' : checkedItems.has(item.id) ? 'text-ayush-green-dark' : 'text-ayush-dark'
                    }`}>
                      {item.title}
                    </h3>
                    <p className="text-sm text-ayush-dark-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}

              {relevantItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-ayush-dark-muted gap-3">
                  <AlertCircle className="w-8 h-8 text-ayush-border" />
                  <p className="text-sm">Please select a valid formulation category to view the checklist.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-ayush-border bg-white shrink-0 flex items-center justify-between">
              <p className="text-xs text-ayush-dark-muted font-mono">
                <ShieldCheck className="w-4 h-4 inline-block mr-1.5 text-ayush-green-dark" />
                This checklist does not constitute formal legal clearance.
              </p>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-ayush-cream hover:bg-ayush-border text-ayush-dark text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
