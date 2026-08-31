import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, X, Loader2 } from 'lucide-react';
import { pcmToBase64, playAudioChunk, resetAudioSync } from '../lib/audioUtils';
import { AppState } from '../types';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
}

export function VoiceModal({ isOpen, onClose, state }: VoiceModalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      startSession().catch(e => {
        if (active) {
          console.error(e);
        }
      });
    } else {
      stopSession();
    }
    return () => {
      active = false;
      stopSession();
    };
  }, [isOpen]);

  const startSession = async () => {
    setErrorMsg(null);
    try {
      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;

      resetAudioSync();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live?jurisdiction=${encodeURIComponent(state.jurisdiction)}&category=${encodeURIComponent(state.formulationCategory)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const source = inputAudioCtx.createMediaStreamSource(stream);
      // Deprecated but works consistently for raw PCM capture
      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      const handleOpen = () => {
        console.log("WebSocket connected to /live");
        setIsConnected(true);
        if (outputAudioCtx.state === 'suspended') {
          outputAudioCtx.resume();
        }
        // Start streaming
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      };

      if (ws.readyState === WebSocket.OPEN) {
        handleOpen();
      } else {
        ws.onopen = handleOpen;
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          setIsSpeaking(true);
          if (outputAudioCtx.state === 'suspended') {
            outputAudioCtx.resume();
          }
          playAudioChunk(outputAudioCtx, msg.audio);
          // Set a timeout to turn off speaking state if no new audio arrives
          clearTimeout((window as any).speakingTimeout);
          (window as any).speakingTimeout = setTimeout(() => setIsSpeaking(false), 500);
        }
        if (msg.interrupted) {
          resetAudioSync();
          setIsSpeaking(false);
        }
      };
      
      ws.onerror = (e) => {
        console.error("VoiceModal WebSocket Error:", e);
        setErrorMsg("Failed to connect to Voice Server. Please try again.");
      };

      ws.onclose = (e) => {
        console.log("VoiceModal WebSocket closed:", e);
        setIsConnected(false);
        const wasActive = (wsRef.current === ws);
        stopSession();
        if (wasActive) {
          // If we didn't explicitly close it (user didn't click Close, which calls onClose -> stopSession), show an error
          setErrorMsg("Connection to Voice Server was closed unexpectedly. The AI may be over quota.");
        } else if (!errorMsg) {
          onClose();
        }
      };

    } catch (e: any) {
      console.error(e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setErrorMsg("Microphone access denied. Please open the app in a new tab to grant permissions.");
      } else {
        setErrorMsg("Could not start voice session: " + e.message);
      }
    }
  };

  const stopSession = () => {
    setIsConnected(false);
    setIsSpeaking(false);
    try {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ close: true }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    } catch (e) {
      console.error(e);
    }
    
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (inputAudioCtxRef.current) {
      try {
        if (inputAudioCtxRef.current.state !== 'closed') {
          inputAudioCtxRef.current.close();
        }
      } catch (e) {}
    }
    if (outputAudioCtxRef.current) {
      try {
        if (outputAudioCtxRef.current.state !== 'closed') {
          outputAudioCtxRef.current.close();
        }
      } catch (e) {}
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ayush-dark/40 backdrop-blur-xs"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative flex flex-col items-center justify-center bg-white border border-ayush-border rounded-3xl p-12 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full text-ayush-dark-muted hover:text-ayush-dark hover:bg-ayush-cream transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-8 text-center space-y-2">
              <h3 className="text-xl font-bold text-ayush-dark">
                Voice Assistant
              </h3>
              <p className="text-xs font-mono font-semibold text-ayush-green-dark">
                Auto Language Alignment Enabled
              </p>
            </div>

            {/* Vibrating Atom / Mic Visualizer */}
            <div className="relative flex flex-col items-center justify-center w-full min-h-[160px]">
              {errorMsg ? (
                <div className="text-center max-w-sm px-6">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                    <X className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-sm text-red-600 font-semibold mb-4">{errorMsg}</p>
                  <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-ayush-cream hover:bg-ayush-border text-ayush-dark rounded-xl text-sm font-bold transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center justify-center w-40 h-40">
                  {isConnected ? (
                    <>
                      <motion.div
                        animate={
                          isSpeaking
                            ? { scale: [1, 1.4, 1.2, 1.5, 1], rotate: 180, borderRadius: ["50%", "30%", "50%"] }
                            : { scale: [1, 1.1, 1], rotate: 90, borderRadius: ["50%", "40%", "50%"] }
                        }
                        transition={{ repeat: Infinity, duration: isSpeaking ? 1 : 3, ease: "easeInOut" }}
                        className="absolute w-full h-full border-4 border-ayush-green/30 rounded-full"
                      />
                      <motion.div
                        animate={
                          isSpeaking
                            ? { scale: [1, 1.3, 1], rotate: -180, borderRadius: ["50%", "40%", "50%"] }
                            : { scale: [1, 1.15, 1], rotate: -90, borderRadius: ["50%", "30%", "50%"] }
                        }
                        transition={{ repeat: Infinity, duration: isSpeaking ? 0.8 : 2.5, ease: "easeInOut" }}
                        className="absolute w-full h-full border-4 border-ayush-orange/30 rounded-full"
                      />
                      
                      <div className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-500 ${isSpeaking ? 'bg-ayush-orange shadow-[0_0_30px_rgba(245,134,55,0.4)]' : 'bg-ayush-cream border border-ayush-green/50 shadow-2xs'}`}>
                        <Mic className={`w-8 h-8 ${isSpeaking ? 'text-white' : 'text-ayush-green-dark'}`} />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-ayush-dark-muted gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-ayush-green-dark" />
                      <span className="text-xs font-mono font-bold uppercase tracking-widest text-ayush-dark-muted">Connecting...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!errorMsg && (
              <p className="mt-8 text-sm font-mono text-ayush-dark-muted h-6">
                {isConnected 
                   ? (isSpeaking ? "Assistant is speaking..." : "Listening...")
                  : ""
                }
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
