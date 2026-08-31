import { useState } from 'react';
import { Chat } from './components/Chat';
import { AbsChecklistModal } from './components/AbsChecklistModal';
import { AppState } from './types';

export default function App() {
  const [state, setState] = useState<AppState>({
    jurisdiction: 'India',
    formulationCategory: 'Unknown',
    textOutputLanguage: 'Auto',
  });
  
  const [isAbsOpen, setIsAbsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF5ED] text-[#2D2A26] font-sans antialiased selection:bg-[#389B46]/20 flex flex-col">
      <Chat 
        state={state} 
        setState={setState} 
        onOpenAbs={() => setIsAbsOpen(true)} 
      />
      <AbsChecklistModal 
        isOpen={isAbsOpen} 
        onClose={() => setIsAbsOpen(false)} 
        formulationCategory={state.formulationCategory} 
      />
    </div>
  );
}
