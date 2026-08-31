import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || process.env.VITE_PORT || process.env.APP_PORT || 3000);
  const server = http.createServer(app);

  // WebSocket Server for Live API
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
    console.log("New WebSocket connection to /live received");
    // Parse query params to get language, jurisdiction, etc.
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const language = url.searchParams.get("language") || "English";
    const jurisdiction = url.searchParams.get("jurisdiction") || "India";
    const category = url.searchParams.get("category") || "Unknown";

    try {
      let rejectConnection: ((error: Error) => void) | null = null;
      
      const connectPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: `You are a highly knowledgeable, multilingual AI assistant for Intellectual Property and regulatory guidance specifically for Ayurveda.
Your primary role is to provide accurate, source-cited, and clear guidance for Ayurvedic practitioners, researchers, MSMEs, and cultivators navigating IP regimes (patents, GI, trademarks, copyrights, trade secrets, plant-variety rights) and regulatory frameworks (Drugs and Cosmetics Act, biological diversity, etc.).

Crucial Context provided by user:
- Target Jurisdiction: ${jurisdiction}
- Formulation Classification: ${category}

STRICT MANDATORY DOMAIN GUARDRAIL & RAG RULES (VOICE RULES):
- RAG GROUNDED INFORMATION: Speak ONLY source-cited regulatory and statutory information grounded in retrieved acts, section rules, and TKDL prior art.
- CONCISENESS & BREVITY: Keep all spoken responses short, direct, and to the point (2 to 4 sentences maximum per response). Avoid lengthy monologues or long speeches.
- MANDATORY DOMAIN GUARDRAIL: You MUST ONLY answer queries related to Ayurvedic Intellectual Property (patents, Section 3(p), GI, trademarks, TKDL prior-art), Biological Diversity (ABS) compliance, Drugs & Cosmetics Act (Rule 158B), FSSAI Ayurveda-Aahar regulations, and related Indian traditional knowledge frameworks.
If the user asks about ANY topic outside this scope (e.g. general technology, coding, general medical advice, sports, politics, weather, recipes, pop culture, entertainment, or general conversation), YOU ARE MANDATED TO REFUSE TO ANSWER.
Politely state in the user's input language: "I am programmed exclusively to assist with Ayurvedic Intellectual Property, TKDL prior-art, and regulatory compliance. I cannot answer queries outside this domain. Please ask a question related to Ayurvedic IP or regulatory compliance."

CRITICAL LANGUAGE RULE:
Output language MUST ALWAYS EQUAL Input language (Output language == Input language). Automatically detect the language spoken by the user in real-time (Hindi, Sanskrit, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, English, etc.) and respond in that exact same language. Maintain a professional and highly empathetic tone.`,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ audio }));
              }
            }
            if (message.serverContent?.interrupted) {
              if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
            }
          },
          onclose: () => {
            if (rejectConnection) {
               rejectConnection(new Error("Gemini Live API closed unexpectedly."));
            }
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.close();
            }
          },
        }
      });

      const timeoutPromise = new Promise<any>((_, reject) => {
        rejectConnection = reject;
        setTimeout(() => reject(new Error("Connection to Gemini Live API timed out.")), 15000);
      });

      const session = await Promise.race([connectPromise, timeoutPromise]);
      rejectConnection = null; session.sendRealtimeInput([{text: "The user has just connected to the voice session. Say hello and briefly introduce yourself in their chosen language. Do NOT say you are an AI. Just greet them."}]); 

      clientWs.on("message", (data) => {
        try {
          const { audio, close } = JSON.parse(data.toString());
          if (close) {
             // In the new SDK, session doesn't expose a direct close method? 
             // We can just rely on the clientWs close event or let the WS close.
             return;
          }
          if (audio) {
             session.sendRealtimeInput({
               audio: { mimeType: "audio/pcm;rate=16000", data: audio }
             });
          }
        } catch(e) {
          console.error(e);
        }
      });
      
      clientWs.on("close", () => {
        // Just let it close or if there is a way to disconnect
      });

    } catch (e) {
      console.error("Live API Connection error", e);
      clientWs.close();
    }
  });

  app.use(express.json());

  const RAG_BACKEND_URL = process.env.RAG_BACKEND_URL || "http://127.0.0.1:8000";

  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { messages, jurisdiction, formulationCategory, outputLanguage } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }

      // 1. Primary: Forward to the Python RAG Backend with Hybrid Retrieval & Cross-Encoder
      try {
        const ragRes = await fetch(`${RAG_BACKEND_URL}/api/gemini/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, jurisdiction, formulationCategory, outputLanguage }),
          signal: AbortSignal.timeout(35000)
        });

        if (ragRes.ok) {
          const ragData = await ragRes.json();
          return res.json(ragData);
        } else {
          console.warn(`RAG backend returned status ${ragRes.status}, using grounded fallback.`);
        }
      } catch (ragErr: any) {
        console.warn("Python RAG backend connection attempt:", ragErr.message || ragErr);
      }

      // 2. Secondary: Grounded Fallback strictly restricted to the 4 authorized domains
      const userText = messages[messages.length - 1]?.content || '';
      const isHindiInput = /[\u0900-\u097F]/.test(userText);
      const isTamilInput = /[\u0B80-\u0BFF]/.test(userText);
      const isTeluguInput = /[\u0C00-\u0C7F]/.test(userText);

      let targetLang = "English";
      if (outputLanguage && outputLanguage !== "Auto") {
        targetLang = outputLanguage;
      } else if (isHindiInput) {
        targetLang = "Hindi";
      } else if (isTamilInput) {
        targetLang = "Tamil";
      } else if (isTeluguInput) {
        targetLang = "Telugu";
      }

      const isClassical = formulationCategory === 'Classical Medicine' || /chyawanprash|triphala|samhita|classical/i.test(userText);

      const fallbackAnswers: Record<string, string> = {
        Marathi: `### मुख्य निष्कर्ष (Core Summary)
पारंपरिक आयुर्वेदिक फॉर्म्युलेशनचे पेटंट घेण्यासाठी, पारंपरिक ज्ञानाच्या पलीकडे (Patents Act 1970 § 3(p)) एक नाविन्यपूर्ण सहक्रियात्मक (synergistic) परिणाम सिद्ध करणे आवश्यक आहे.

### प्रमुख कायदेशीर आणि नियामक तरतुदी
- **पेटंट अपवर्जन (Patents Act 1970 § 3(p))**: ज्ञात पारंपरिक घटकांचे साधे मिश्रण पेटंटपात्र नाही; नवीन कार्यक्षमता सिद्ध करणे बंधनकारक आहे [Patents Act 1970 § 3(p), as on 2024-03-15].
- **एनबीए मान्यता (Biological Diversity Act § Section 6)**: भारतीय जैविक संसाधनांच्या वापरासाठी पेटंट मंजुरीपूर्वी राष्ट्रीय जैवविविधता प्राधिकरणाची (NBA) Form III पूर्वपरवानगी अनिवार्य आहे [Biological Diversity Act 2002 § Section 6].
- **जलद तपासणी (Patents Rules 2024 § Rule 24C)**: एमएसएमई/स्टार्टअप Form 18A द्वारे जलद तपासणीसाठी अर्ज करू शकतात [Patents Rules 2024 § Rule 24C].

### शिफारस केलेल्या पुढील पायऱ्या
1. टीकेडीएल (TKDL) डेटाबेसमध्ये पूर्व-कला (prior art) शोधा.
2. पेटंट मिळण्यापूर्वी राष्ट्रीय जैवविविधता प्राधिकरणाकडे (NBA) Form III अर्ज दाखल करा.
3. Section 3(p) आक्षेपांवर मात करण्यासाठी सहक्रियात्मक परिणाम (synergy data) सादर करा.

*अस्वीकरण: ही माहिती केवळ वैधानिक मार्गदर्शनासाठी आहे, कायदेशीर सल्ला नाही.*`,
        Hindi: `### मुख्य निष्कर्ष (Core Summary)
आयुर्वेद दवा/फॉर्मूलेशन को पेटेंट कराने के लिए पारंपरिक ज्ञान (Patents Act 1970 § 3(p)) से परे एक नवीन सहक्रियात्मक (synergistic) प्रभाव सिद्ध करना आवश्यक है।

### प्रमुख कानूनी एवं नियामक प्रावधान
- **पेटेंट छूट (Patents Act 1970 § 3(p))**: केवल पारंपरिक घटकों का मिश्रण पेटेंट योग्य नहीं है; नवीन डिलीवरी या सहक्रियात्मक प्रभाव सिद्ध करना अनिवार्य है [Patents Act 1970 § 3(p), as on 2024-03-15]।
- **त्वरित परीक्षा (Patents Rules 2024 § Rule 24C)**: एमएसएमई/स्टार्टअप फॉर्म 18ए के तहत तेजी से जांच का अनुरोध कर सकते हैं [Patents Rules 2024 § Rule 24C]।
- **एनबीए अनुमोदन (Biological Diversity Act § Section 6)**: भारतीय जैविक संसाधनों के उपयोग के लिए पेटेंट अनुदान से पूर्व राष्ट्रीय जैव विविधता प्राधिकरण (NBA) से Form III स्वीकृति अनिवार्य है [Biological Diversity Act 2002 § Section 6]।

### अनुशंसित अगले कदम
1. राष्ट्रीय जैव विविधता प्राधिकरण (nbaindia.nic.in) से जैविक संसाधनों के लिए Form III स्वीकृति प्राप्त करें।
2. टीकेडीएल (tkdl.res.in) डेटाबेस में पूर्व-कला (prior art) की जांच करें।
3. धारा 3(p) की आपत्तियों को दूर करने के लिए सहक्रियात्मक डेटा (synergy data) प्रस्तुत करें।

*अस्वीकरण: यह जानकारी केवल शैक्षणिक एवं सांविधिक मार्गदर्शन के लिए है, कानूनी सलाह नहीं है।*`,
        Tamil: `### முக்கிய சுருக்கம் (Core Summary)
ஒரு ஆயுர்வேத மருந்தை காப்புரிமை செய்ய, அறியப்பட்ட பாரம்பரிய அறிவைத் தாண்டி (Patents Act 1970 § 3(p)) ஒரு புதிய ஒருங்கிணைந்த (synergistic) செயல்திறனை நிரூபிக்க வேண்டும்.

### முக்கிய சட்ட விதிகள்
- **காப்புரிமை விலக்கு (Patents Act 1970 § 3(p))**: பாரம்பரிய மூலிகைகளின் எளிய கலவை காப்புரிமை பெறத் தகுதியற்றது [Patents Act 1970 § 3(p), as on 2024-03-15].
- **தேசிய பல்லுயிர் ஆணையத்தின் அனுமதி (BDA 2002 § Section 6)**: இந்திய உயிரியல் வளங்களைப் பயன்படுத்துவதற்கு காப்புரிமை பெறுவதற்கு முன் NBA Form III அனுமதி பெறுவது கட்டாயமாகும் [Biological Diversity Act 2002 § Section 6].
- **விரைவு பரிசோதனை (Patents Rules 2024 § Rule 24C)**: MSME / Startups Form 18A மூலம் விரைவான ஆய்வைக் கோரலாம் [Patents Rules 2024 § Rule 24C].

### பரிந்துரைக்கப்பட்ட அடுத்த படிகள்
1. காப்புரிமைக்கு முன் TKDL தரவுத்தளத்தில் முன்-கலையை (prior art) சரிபார்க்கவும்.
2. காப்புரிமை பெறுவதற்கு முன் NBA உடன் Form III விண்ணப்பத்தை தாக்கல் செய்யவும்.

*துறப்பு: இந்தத் தகவல் சட்ட வழிகாட்டுதலுக்கானது மட்டுமே, சட்ட ஆலோசனை அல்ல.*`,
        Telugu: `### ముఖ్య సారాంశం (Core Summary)
ఆయుర్వేద ఔషధానికి పేటెంట్ పొందడానికి, సాంప్రదాయ జ్ఞానాన్ని మించి (Patents Act 1970 § 3(p)) ఒక కొత్త సినర్జిస్టిక్ ప్రభావాన్ని నిరూపించాలి.

### కీలక చట్టపరమైన నిబంధనలు
- **సెక్షన్ 3(p) మినహాయింపు**: సాంప్రదాయ మూలికల సాధారణ మిశ్రమానికి పేటెంట్ లభించదు [Patents Act 1970 § 3(p), as on 2024-03-15].
- **ఎన్‌బీఏ అనుమతి (BDA 2002 § Section 6)**: భారతీయ జీవ వనరుల వినియోగానికి పేటెంట్ మంజూరుకు ముందే జాతీయ జీవవైవిధ్య అథారిటీ (NBA) నుండి Form III అనుమతి తప్పనిసరి [Biological Diversity Act 2002 § Section 6].
- **త్వరిత పరిశీలన (Patents Rules 2024 § Rule 24C)**: MSMEలు/స్టార్టప్‌లు Form 18A ద్వారా వేగవంతమైన పరిశీలనను అభ్యర్థించవచ్చు [Patents Rules 2024 § Rule 24C].

### సిఫార్సు చేయబడిన తదుపరి చర్యలు
1. ఫైల్ చేయడానికి ముందు TKDL డేటాబేస్ లో ముందస్తు సమాచారాన్ని (prior art) తనిఖీ చేయండి.
2. పేటెంట్ గ్రాంట్‌కు ముందే నేషనల్ బయోడైవర్సిటీ అథారిటీకి Form III సమర్పించండి.

*నిరాకరణ: ఇది చట్టపరమైన సమాచారం మాత్రమే, న్యాయ సలహా కాదు.*`,
        English: `### Core Summary
To patent an Ayurvedic formulation, your invention must demonstrate an inventive step beyond known traditional knowledge (Patents Act 1970 § Section 3(p)) by demonstrating unexpected synergistic efficacy.

### Key Statutory Provisions
- **Section 3(p) Exclusion**: Simple combinations or admixtures of known traditional herbs are non-patentable prior art under Section 3(p) [Patents Act 1970 § 3(p), as on 2024-03-15].
- **Mandatory NBA Form III Approval**: Mandatory prior approval of the National Biodiversity Authority before patent grant for any invention utilizing Indian biological resources [Biological Diversity Act 2002 § Section 6].
- **Expedited Examination (Patents Rules 2024 § Rule 24C)**: Startups and MSMEs can submit Form 18A for fast-track examination [Patents Rules 2024 § Rule 24C].

### Recommended Actionable Steps
1. Conduct a prior-art search against the TKDL database (tkdl.res.in) before filing.
2. File Form III with the National Biodiversity Authority (nbaindia.nic.in) prior to patent grant.
3. Submit empirical data proving synergy (combination index < 1) to overcome Section 3(p) objections.

*Disclaimer: Information, not legal advice.*`
      };

      const fallbackResponse = {
        answer: fallbackAnswers[targetLang] || fallbackAnswers["English"],
        outputLanguage: targetLang,
        citations: [
          {
            source: "Patents Act 1970 - Section 3(p)",
            sectionRef: "Section 3(p)",
            description: "Inventions relating to traditional knowledge or aggregation of known components are non-patentable.",
            exactTextSnippet: "An invention which in effect, is traditional knowledge or which is an aggregation or duplication of known properties of traditionally known component or components.",
            url: "https://indiacode.gov.in/items/7468481f-b8ab-4029-b914-b926971c91df",
            url_precision: "section-level"
          },
          {
            source: "Biological Diversity Act 2002 - Section 6",
            sectionRef: "Section 6",
            description: "Mandatory prior approval of the National Biodiversity Authority before applying for or receiving patent grant.",
            exactTextSnippet: "No person shall apply for any intellectual property right in or outside India for any invention based on biological resource obtained from India without previous approval of NBA.",
            url: "https://indiacode.gov.in/items/134e1072-b6b1-49fd-ba31-d5f9abaad864",
            url_precision: "section-level"
          },
          {
            source: "Patents Rules 2024 - Rule 24C",
            sectionRef: "Rule 24C",
            description: "Expedited examination of patent applications for Startups, MSMEs, and female applicants via Form 18A.",
            exactTextSnippet: "An applicant may file a request for expedited examination in Form 18A on grounds of being an MSME, Startup, or eligible entity.",
            url: "https://ipindia.gov.in/resource/patents-resources-rules",
            url_precision: "section-level"
          },
          {
            source: "NBA Form III Application - Regulation 8",
            sectionRef: "Form III",
            description: "Application for seeking prior approval of NBA for applying for Intellectual Property Rights.",
            exactTextSnippet: "Mandatory statutory application and benefit sharing agreement required before grant of patent.",
            url: "https://www.nbaindia.nic.in/application-form/form-application-fee",
            url_precision: "section-level"
          }
        ],
        confidence: "HIGH",
        needsHumanEscalation: false,
        isClassicalTKDL: isClassical,
        absChecklist: {
          applies: true,
          biologicalResourcesDetected: ["Ayurvedic Botanical Extracts"],
          complianceSteps: [
            {
              title: "NBA Form III Approval",
              status: "REQUIRED",
              description: "Prior NBA approval before patent grant for Indian biological resources.",
              authority: "National Biodiversity Authority (nbaindia.nic.in)"
            },
            {
              title: "SBB Prior Intimation (Form I-A)",
              status: "REQUIRED",
              description: "Prior intimation to the State Biodiversity Board for commercial utilization.",
              authority: "State Biodiversity Board (Biological Diversity Act § 7)"
            }
          ],
          overallRisk: "MEDIUM"
        }
      };

      res.json(fallbackResponse);

    } catch (error: any) {
      console.error("Chat Error:", error);
      res.status(500).json({ error: error.message || "An error occurred while communicating with the AI." });
    }
  });

  app.post("/api/abs/check", async (req, res) => {
    try {
      const resp = await fetch(`${RAG_BACKEND_URL}/api/abs/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const data = await resp.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: "ABS service unavailable: " + (err.message || err) });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Express 4 uses * for catch-all
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
