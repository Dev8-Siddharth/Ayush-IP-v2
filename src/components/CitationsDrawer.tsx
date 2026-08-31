import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, ExternalLink, Copy, Check, Search, ShieldCheck, Filter } from 'lucide-react';
import { ChatMessage } from '../types';
import { enrichCitation, EnrichedCitation } from '../lib/citationUtils';

interface CitationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
}

export function CitationsDrawer({ isOpen, onClose, messages }: CitationsDrawerProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Extract and enrich all unique citations from messages
  const allEnrichedCitations: EnrichedCitation[] = [];
  messages.forEach(msg => {
    if (msg.citations) {
      msg.citations.forEach(c => {
        if (!allEnrichedCitations.some(existing => existing.source === c.source)) {
          allEnrichedCitations.push(enrichCitation(c));
        }
      });
    }
  });

  const categories = ['ALL', ...Array.from(new Set(allEnrichedCitations.map(c => c.docCategory)))];

  const filteredCitations = allEnrichedCitations.filter(c => {
    const matchesSearch = c.source.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'ALL' || c.docCategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopy = (citation: EnrichedCitation, index: number) => {
    const textToCopy = `[Regulatory Citation] ${citation.source}\nCategory: ${citation.docCategory}\nMandate: ${citation.description || 'N/A'}\nSource Portal: ${citation.url}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-end bg-ayush-dark/40 backdrop-blur-xs"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-w-xl bg-white border-l border-ayush-border h-full flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-ayush-border bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ayush-green-light border border-ayush-green/30 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-ayush-green-dark" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ayush-dark">Ayurvedic Regulatory Sources Index</h2>
                  <p className="text-xs font-mono text-ayush-dark-muted mt-0.5">
                    {allEnrichedCitations.length} Authoritative Statutes & Documents Cited
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-ayush-dark-muted hover:text-ayush-dark hover:bg-ayush-cream transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls (Search & Category Filter) */}
            <div className="p-4 border-b border-ayush-border bg-ayush-cream-light space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-ayush-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search statutes, rules, acts, or API texts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-ayush-border rounded-xl pl-9 pr-4 py-2 text-xs text-ayush-dark placeholder:text-ayush-dark-muted focus:outline-none focus:ring-1 focus:ring-ayush-green"
                />
              </div>

              {categories.length > 2 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <Filter className="w-3.5 h-3.5 text-ayush-dark-muted shrink-0 mr-1" />
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono whitespace-nowrap transition-colors border ${
                        selectedCategory === cat
                          ? 'bg-ayush-green text-white border-ayush-green font-bold'
                          : 'bg-white text-ayush-dark border-ayush-border hover:border-ayush-green/40'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* List of Citations */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin bg-ayush-cream-light/30">
              {filteredCitations.map((cit, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-ayush-border rounded-xl p-4 space-y-3 hover:border-ayush-green/40 transition-all shadow-2xs group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border bg-ayush-green-light text-ayush-green-dark border-ayush-green/30">
                          {cit.docCategory}
                        </span>
                        {cit.authorityLevel && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border uppercase tracking-wide bg-ayush-cream text-ayush-brown border-ayush-brown/30">
                            {cit.authorityLevel === 'official-primary' ? 'Official Primary' : cit.authorityLevel === 'official-secondary' ? 'Official Secondary' : 'Secondary'}
                          </span>
                        )}
                        {cit.sectionRef && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-ayush-cream-light text-ayush-dark border border-ayush-border">
                            📍 {cit.sectionRef}
                          </span>
                        )}
                      </div>
                      <a
                        href={cit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-ayush-dark hover:text-ayush-green-dark leading-snug flex items-center gap-1.5 group transition-colors"
                      >
                        <span className="underline underline-offset-2 decoration-ayush-border group-hover:decoration-ayush-green">{cit.source}</span>
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopy(cit, idx)}
                        title="Copy citation details"
                        className="p-1.5 rounded-lg text-ayush-dark-muted hover:text-ayush-dark hover:bg-ayush-cream transition-colors"
                      >
                        {copiedIndex === idx ? <Check className="w-4 h-4 text-ayush-green-dark" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={cit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open exact paragraph on ${cit.portalName}`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-ayush-green-light hover:bg-ayush-green/20 text-ayush-green-dark border border-ayush-green/30 transition-all"
                      >
                        <span>Open Page</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {cit.exactTextSnippet ? (
                    <div className="text-xs text-ayush-dark leading-relaxed font-mono bg-ayush-cream-light p-3 rounded-lg border border-ayush-border space-y-1">
                      <div className="text-[10px] font-bold text-ayush-green-dark uppercase tracking-wider">
                        Retrieved Statutory Text:
                      </div>
                      <p className="italic text-ayush-dark font-sans">
                        "{cit.exactTextSnippet}"
                      </p>
                    </div>
                  ) : cit.description ? (
                    <p className="text-xs text-ayush-dark-muted leading-relaxed font-sans bg-ayush-cream-light p-2.5 rounded-lg border border-ayush-border">
                      {cit.description}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between text-[11px] font-mono text-ayush-dark-muted pt-1">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-ayush-green-dark" />
                      Official Portal: <span className="text-ayush-dark font-semibold">{cit.portalName}</span>
                    </span>
                    {cit.url_precision && (
                      <span className="text-[10px] font-mono text-ayush-green-dark font-bold uppercase">
                        {cit.url_precision}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {filteredCitations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-ayush-dark-muted gap-2">
                  <BookOpen className="w-10 h-10 text-ayush-border mb-2" />
                  <p className="text-sm font-medium text-ayush-dark">No regulatory citations found</p>
                  <p className="text-xs text-ayush-dark-muted text-center max-w-xs">
                    Start asking questions about Ayurvedic IP, patents, or ABS regulations to generate authoritative document sources.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-ayush-border bg-white shrink-0 text-center">
              <p className="text-[11px] text-ayush-dark-muted font-mono">
                Citations grounded exclusively in India Code, IP India, National Biodiversity Authority, & TKDL repositories.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
