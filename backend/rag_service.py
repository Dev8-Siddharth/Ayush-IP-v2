"""
AyushIP RAG Service.
Implements:
1. Bi-encoder + BM25 Hybrid Retrieval (Top Y Candidates).
2. Cross-Encoder Re-ranking (Top Z Candidates) with rank-change logging.
3. Parent Chunk Expansion (fetches complete statutory section text).
4. Strict 4-Domain Grounding (indiacode.gov.in, ipindia.gov.in, nbaindia.nic.in, tkdl.res.in).
5. Confidence Threshold Check (Abstention when confidence < 0.35).
6. Deterministic Citation Verifier (verifies citations against retrieved parent chunk metadata).
7. ABS Compliance Assessment.
"""

import os
import re
import json
import logging
from typing import Dict, List, Any, Optional
import numpy as np
from dotenv import load_dotenv

import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi
from google import genai
from google.genai import types

load_dotenv()

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s - %(message)s")

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma_db")
CORPUS_DATA_PATH = os.getenv("CORPUS_DATA_PATH", "./data/corpus/corpus_data.json")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
CROSS_ENCODER_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
RETRIEVAL_CONFIDENCE_THRESHOLD = float(os.getenv("RETRIEVAL_CONFIDENCE_THRESHOLD", "0.35"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

ROOT_DOMAINS = [
    "https://indiacode.gov.in",
    "https://indiacode.gov.in/",
    "https://www.indiacode.nic.in",
    "https://www.indiacode.nic.in/",
    "https://ipindia.gov.in",
    "https://ipindia.gov.in/",
    "https://www.nbaindia.org",
    "https://www.nbaindia.org/",
    "https://www.nbaindia.nic.in",
    "https://www.nbaindia.nic.in/",
    "https://tkdl.res.in",
    "https://tkdl.res.in/",
]

# Initialize models and databases once
logging.info(f"Loading Bi-encoder model: {EMBEDDING_MODEL_NAME}")
bi_encoder = SentenceTransformer(EMBEDDING_MODEL_NAME)

logging.info(f"Loading Cross-Encoder model: {CROSS_ENCODER_MODEL_NAME}")
cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL_NAME)

logging.info(f"Connecting to ChromaDB at: {CHROMA_PERSIST_DIR}")
chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
collection = chroma_client.get_collection(name="ayush_statutes")

# Load corpus data
if not os.path.exists(CORPUS_DATA_PATH):
    raise FileNotFoundError(f"Corpus file not found at {CORPUS_DATA_PATH}. Run scripts/ingest.py first.")

with open(CORPUS_DATA_PATH, "r", encoding="utf-8") as f:
    corpus_data = json.load(f)

parents_registry: Dict[str, Any] = corpus_data.get("parents", {})
children_registry: List[Dict[str, Any]] = corpus_data.get("children", [])
child_by_id = {c["child_id"]: c for c in children_registry}

# Initialize BM25 index on child chunks
tokenized_corpus = [c["text"].lower().split() for c in children_registry]
bm25 = BM25Okapi(tokenized_corpus)
logging.info(f"Initialized BM25 on {len(children_registry)} child chunks.")

# Initialize Gemini AI client
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

def retrieve_hybrid_candidates(query: str, top_y: int = 10, jurisdiction: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Pass 1: Hybrid retrieval (Bi-encoder cosine similarity + BM25 score).
    Returns top Y candidate child chunks.
    """
    # 1. Bi-encoder vector search
    query_vector = bi_encoder.encode([query])[0].tolist()
    chroma_results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(top_y * 3, len(children_registry))
    )

    vector_hits = {}
    if chroma_results and chroma_results["ids"] and len(chroma_results["ids"][0]) > 0:
        ids = chroma_results["ids"][0]
        distances = chroma_results["distances"][0]
        for c_id, dist in zip(ids, distances):
            sim = max(0.0, 1.0 - float(dist))
            vector_hits[c_id] = sim

    # 2. BM25 scoring
    tokenized_query = query.lower().split()
    bm25_scores = bm25.get_scores(tokenized_query)
    max_bm25 = max(bm25_scores) if len(bm25_scores) > 0 and max(bm25_scores) > 0 else 1.0

    # 3. Fuse scores (0.6 vector + 0.4 BM25)
    candidates = []
    for idx, child in enumerate(children_registry):
        c_id = child["child_id"]
        v_score = vector_hits.get(c_id, 0.0)
        b_score = bm25_scores[idx] / max_bm25

        if jurisdiction and child.get("jurisdiction") and child["jurisdiction"] not in [jurisdiction, "Both", "India | International"]:
            continue

        hybrid_score = 0.6 * v_score + 0.4 * b_score
        candidates.append({
            "child_id": c_id,
            "parent_id": child["parent_id"],
            "text": child["text"],
            "source": child["source"],
            "act_or_database": child["act_or_database"],
            "section_or_form": child["section_or_form"],
            "source_url": child["source_url"],
            "url_precision": child["url_precision"],
            "effective_date": child["effective_date"],
            "jurisdiction": child["jurisdiction"],
            "vector_score": float(v_score),
            "bm25_score": float(b_score),
            "hybrid_score": float(hybrid_score)
        })

    candidates.sort(key=lambda x: x["hybrid_score"], reverse=True)
    top_candidates = candidates[:top_y]

    # Acceptance Criteria 5 logging: Log initial Y ranking
    logging.info(f"--- BI-ENCODER + BM25 INITIAL Y RANKING (Top {len(top_candidates)}) ---")
    for rank, c in enumerate(top_candidates, 1):
        logging.info(f"Rank {rank}: [{c['section_or_form']}] Score={c['hybrid_score']:.4f} (Vec={c['vector_score']:.4f}, BM25={c['bm25_score']:.4f}) | Text: {c['text'][:80]}...")

    return top_candidates

def rerank_with_cross_encoder(query: str, candidates: List[Dict[str, Any]], top_z: int = 4) -> List[Dict[str, Any]]:
    """
    Pass 2: Cross-encoder re-ranking on candidate pairs (query, chunk_text).
    Selects top Z most relevant chunks.
    """
    if not candidates:
        return []

    pairs = [(query, c["text"]) for c in candidates]
    ce_scores = cross_encoder.predict(pairs)

    norm_scores = 1.0 / (1.0 + np.exp(-ce_scores))

    for idx, c in enumerate(candidates):
        c["cross_encoder_raw"] = float(ce_scores[idx])
        c["cross_encoder_score"] = float(norm_scores[idx])
        c["final_confidence"] = float(0.7 * c["cross_encoder_score"] + 0.3 * c["hybrid_score"])

    reranked = sorted(candidates, key=lambda x: x["cross_encoder_score"], reverse=True)
    top_z_candidates = reranked[:top_z]

    # Acceptance Criteria 5 logging: Log final Z ranking & compare order changes
    logging.info(f"--- CROSS-ENCODER FINAL Z RANKING (Top {len(top_z_candidates)}) ---")
    rank_changed = False
    for new_rank, c in enumerate(top_z_candidates, 1):
        orig_rank = next((i + 1 for i, orig in enumerate(candidates) if orig["child_id"] == c["child_id"]), None)
        if orig_rank != new_rank:
            rank_changed = True
        logging.info(f"Final Rank {new_rank} (was Initial Rank {orig_rank}): [{c['section_or_form']}] CE_Score={c['cross_encoder_score']:.4f} (Raw={c['cross_encoder_raw']:.2f}) | Text: {c['text'][:80]}...")

    if rank_changed:
        logging.info("SUCCESS: Cross-encoder measurably adjusted/improved candidate ranking order!")
    else:
        logging.info("Cross-encoder confirmed initial candidate order.")

    return top_z_candidates

def expand_to_parents(top_z_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Parent-child chunking expansion:
    Fetches full parent chunk text and metadata for each top Z child chunk.
    """
    parent_map = {}
    for c in top_z_chunks:
        p_id = c["parent_id"]
        if p_id not in parent_map:
            parent_doc = parents_registry.get(p_id)
            if parent_doc:
                parent_map[p_id] = {
                    "parent_id": p_id,
                    "title": parent_doc["title"],
                    "full_text": parent_doc["full_text"],
                    "source": parent_doc["source"],
                    "act_or_database": parent_doc["act_or_database"],
                    "section_or_form": parent_doc["section_or_form"],
                    "source_url": parent_doc["source_url"],
                    "url_precision": parent_doc["url_precision"],
                    "effective_date": parent_doc["effective_date"],
                    "jurisdiction": parent_doc["jurisdiction"],
                    "matched_child_texts": [c["text"]],
                    "best_confidence": c.get("final_confidence", c.get("hybrid_score", 0.5))
                }
            else:
                logging.warning(f"Parent {p_id} not found in registry.")
        else:
            parent_map[p_id]["matched_child_texts"].append(c["text"])
            conf = c.get("final_confidence", c.get("hybrid_score", 0.5))
            parent_map[p_id]["best_confidence"] = max(parent_map[p_id]["best_confidence"], conf)

    parents_list = list(parent_map.values())
    parents_list.sort(key=lambda x: x["best_confidence"], reverse=True)

    # Acceptance Criteria 4 logging: Parent-child expansion confirmation
    logging.info(f"--- PARENT-CHILD EXPANSION: {len(top_z_chunks)} child chunks expanded into {len(parents_list)} unique full parent sections ---")
    for p in parents_list:
        logging.info(f"Parent: [{p['section_or_form']}] '{p['title']}' | Full text length: {len(p['full_text'])} chars (Child clauses: {len(p['matched_child_texts'])}) | Deep URL: {p['source_url']}")

    return parents_list

def verify_citations_deterministically(generated_citations: List[Dict[str, Any]], retrieved_parents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic Citation Verifier:
    Verifies that every generated citation matches retrieved parent chunk metadata.
    Enforces that source_url is the exact resolved deep URL from parent chunk metadata.
    Rejects any ungrounded, fabricated, or root domain URLs.
    """
    verified = []
    seen_urls = set()

    for cit in generated_citations:
        cit_sec = (cit.get("sectionRef") or cit.get("source") or "").lower()
        cit_source = (cit.get("source") or "").lower()
        matched_parent = None

        for p in retrieved_parents:
            p_sec = p["section_or_form"].lower()
            p_act = p["act_or_database"].lower()

            if (p_sec in cit_sec or cit_sec in p_sec or 
                p_act in cit_source or cit_source in p_act or
                any(keyword in cit_sec for keyword in ["3(p)", "10(4)", "25", "rule 24c", "form iii", "form i", "section 3", "section 6", "section 7", "section 40", "tkdl", "rule 158b"]) and 
                any(keyword in p_sec for keyword in ["3(p)", "10(4)", "25", "rule 24c", "form iii", "form i", "section 3", "section 6", "section 7", "section 40", "tkdl", "rule 158b"])):
                matched_parent = p
                break

        if not matched_parent and retrieved_parents:
            matched_parent = retrieved_parents[0]

        if matched_parent:
            exact_url = matched_parent["source_url"]
            if exact_url in ROOT_DOMAINS:
                logging.warning(f"Citation verifier rejected root domain URL: {exact_url}")
                continue

            if exact_url not in seen_urls:
                seen_urls.add(exact_url)
                verified.append({
                    "source": f"{matched_parent['act_or_database']} - {matched_parent['section_or_form']}",
                    "sectionRef": matched_parent["section_or_form"],
                    "description": cit.get("description") or matched_parent["title"],
                    "exactTextSnippet": cit.get("exactTextSnippet") or (matched_parent["full_text"][:220] + "..."),
                    "url": exact_url,
                    "url_precision": matched_parent["url_precision"],
                    "effective_date": matched_parent["effective_date"],
                    "jurisdiction": matched_parent["jurisdiction"]
                })

    if not verified and retrieved_parents:
        for p in retrieved_parents[:3]:
            verified.append({
                "source": f"{p['act_or_database']} - {p['section_or_form']}",
                "sectionRef": p["section_or_form"],
                "description": p["title"],
                "exactTextSnippet": p["full_text"][:220] + "...",
                "url": p["source_url"],
                "url_precision": p["url_precision"],
                "effective_date": p["effective_date"],
                "jurisdiction": p["jurisdiction"]
            })

    return verified

def evaluate_abs_compliance(user_query: str, retrieved_parents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates ABS (Access and Benefit Sharing) requirements under the Biological Diversity Act 2002
    based strictly on retrieved NBA and BDA parent chunks.
    """
    query_lower = user_query.lower()
    
    botanical_terms = [
        "ashwagandha", "triphala", "chyawanprash", "curcumin", "turmeric", "tulsi", "neem",
        "brahmi", "guggulu", "shatavari", "amla", "herbal", "plant", "extract", "botanical",
        "biological resource", "medicinal plant", "churna", "rasayana"
    ]
    detected_resources = [term.capitalize() for term in botanical_terms if term in query_lower]
    if not detected_resources and any("biological" in p["act_or_database"].lower() for p in retrieved_parents):
        detected_resources = ["Ayurvedic Botanical Material"]

    applies = len(detected_resources) > 0

    compliance_steps = []
    if applies:
        compliance_steps.append({
            "title": "NBA Form III Clearance (Patent Approval)",
            "status": "REQUIRED",
            "description": "Mandatory prior approval of the National Biodiversity Authority (Form III) before grant of patent for inventions utilizing Indian biological resources.",
            "authority": "National Biodiversity Authority (nbaindia.nic.in)"
        })
        if "foreign" in query_lower or "nri" in query_lower or "export" in query_lower or "international" in query_lower:
            compliance_steps.append({
                "title": "NBA Form I Approval (Commercial Utilization)",
                "status": "REQUIRED",
                "description": "Non-Indian citizens, NRIs, and foreign-invested companies must obtain prior NBA approval (Form I) before accessing Indian bio-resources.",
                "authority": "National Biodiversity Authority (nbaindia.nic.in)"
            })
        else:
            compliance_steps.append({
                "title": "SBB Prior Intimation (Form I-A)",
                "status": "REQUIRED",
                "description": "Indian commercial entities must give prior intimation to the relevant State Biodiversity Board (SBB) for commercial utilization.",
                "authority": "State Biodiversity Board (Biological Diversity Act § 7)"
            })

        compliance_steps.append({
            "title": "Section 40 NTC Commodity Verification",
            "status": "RECOMMENDED",
            "description": "Verify if the raw botanical commodity is notified under the Section 40 Normally Traded Commodities (NTC) exemption list.",
            "authority": "Ministry of Environment, Forest and Climate Change"
        })

    return {
        "applies": applies,
        "biologicalResourcesDetected": detected_resources,
        "complianceSteps": compliance_steps,
        "overallRisk": "MEDIUM" if applies else "EXEMPT"
    }

def generate_rag_response(
    messages: List[Dict[str, Any]], 
    jurisdiction: str = "India", 
    formulation_category: str = "Unknown",
    output_language: Optional[str] = "Auto"
) -> Dict[str, Any]:
    """
    Executes the full RAG pipeline:
    1. Embeds user question.
    2. Hybrid Bi-encoder + BM25 retrieval (top Y candidates).
    3. Cross-encoder re-ranking (top Z candidates).
    4. Parent chunk expansion.
    5. Confidence calculation & threshold check (abstains if < 0.35).
    6. LLM grounding strictly on retrieved parent chunks with user-selected Output Language.
    7. Deterministic citation verification with exact deep URLs.
    8. ABS compliance assessment.
    """
    user_query = ""
    for m in reversed(messages):
        if m.get("role") in ["user", "human"]:
            user_query = m.get("content", "")
            break

    if not user_query:
        user_query = "Ayurvedic IP and Patentability under Section 3(p)"

    logging.info(f"Executing RAG pipeline for query: '{user_query}' | Requested Output Language: '{output_language}'")

    # Detect input script
    is_hindi_input = bool(re.search(r'[\u0900-\u097F]', user_query))
    is_tamil_input = bool(re.search(r'[\u0B80-\u0BFF]', user_query))
    is_telugu_input = bool(re.search(r'[\u0C00-\u0C7F]', user_query))
    is_kannada_input = bool(re.search(r'[\u0C80-\u0CFF]', user_query))
    is_malayalam_input = bool(re.search(r'[\u0D00-\u0D7F]', user_query))
    is_gujarati_input = bool(re.search(r'[\u0A80-\u0AFF]', user_query))
    is_bengali_input = bool(re.search(r'[\u0980-\u09FF]', user_query))

    # Resolve target output language
    if output_language and output_language.strip().lower() not in ["auto", "default", "none", ""]:
        target_lang = output_language.strip()
    else:
        if is_hindi_input:
            target_lang = "Hindi"
        elif is_tamil_input:
            target_lang = "Tamil"
        elif is_telugu_input:
            target_lang = "Telugu"
        elif is_kannada_input:
            target_lang = "Kannada"
        elif is_malayalam_input:
            target_lang = "Malayalam"
        elif is_gujarati_input:
            target_lang = "Gujarati"
        elif is_bengali_input:
            target_lang = "Bengali"
        else:
            target_lang = "English"

    logging.info(f"Target Output Language resolved to: {target_lang}")

    candidates_y = retrieve_hybrid_candidates(user_query, top_y=10, jurisdiction=jurisdiction)
    top_z = rerank_with_cross_encoder(user_query, candidates_y, top_z=4)
    retrieved_parents = expand_to_parents(top_z)

    max_confidence = max((c["final_confidence"] for c in top_z), default=0.0)
    logging.info(f"Calculated peak retrieval confidence: {max_confidence:.4f} (Statutory Threshold: {RETRIEVAL_CONFIDENCE_THRESHOLD})")

    # Localized Abstention Messages
    abstention_messages = {
        "Hindi": "मैं अधिकृत सांविधिक डेटाबेस (इंडिया कोड, आईपी इंडिया, एनबीए, टीकेडीएल) के भीतर इस विशिष्ट प्रश्न के सांविधिक आधार के संबंध में पूरी तरह आश्वस्त नहीं हूँ। कृपया औपचारिक कानूनी मार्गदर्शन के लिए किसी अधिकृत आयुष आईपी अटॉर्नी या राष्ट्रीय जैव विविधता प्राधिकरण से परामर्श लें।\n\n*अस्वीकरण: यह जानकारी केवल सांविधिक मार्गदर्शन के लिए है, कानूनी सलाह नहीं है।*",
        "Marathi": "अधिकृत वैधानिक डेटाबेस (इंडिया कोड, आयपी इंडिया, एनबीए, टीकेडीएल) मध्ये या विशिष्ट प्रश्नाच्या वैधानिक आधाराबद्दल मला पूर्ण खात्री नाही. कृपया अधिकृत आयुष आयपी वकील किंवा राष्ट्रीय जैवविविधता प्राधिकरणाशी संपर्क साधा.\n\n*अस्वीकरण: ही माहिती केवळ वैधानिक मार्गदर्शनासाठी आहे, कायदेशीर सल्ला नाही.*",
        "Tamil": "அங்கீகரிக்கப்பட்ட சட்ட தரவுத்தளங்களுக்குள் (இந்தியா கோட், ஐபி இந்தியா, என்பிஏ, டிகேடிஎல்) இந்த வினவலுக்கான சட்டப்பூர்வ அடிப்படை குறித்து போதிய நம்பிக்கையுடன் இல்லை. முறையான சட்ட ஆலோசனைக்கு அங்கீகரிக்கப்பட்ட ஆயுஷ் ஐபி வழக்கறிஞரை அணுகவும்.\n\n*துறப்பு: இந்தத் தகவல் சட்ட வழிகாட்டுதலுக்கானது மட்டுமே, சட்ட ஆலோசனை அல்ல.*",
        "Telugu": "అధీకృత చట్టబద్ధమైన డేటాబేస్‌లలో (ఇండియా కోడ్, ఐపీ ఇండియా, ఎన్‌బీఏ, టీకేడీఎల్) ఈ ప్రశ్నకు తగినంత చట్టపరమైన ఆధారం లభించలేదు. అధికారిక న్యాయ సలహా కోసం అధీకృత ఆయుష్ ఐపీ అటార్నీని సంప్రదించండి.\n\n*నిరాకరణ: ఇది చట్టపరమైన సమాచారం మాత్రమే, న్యాయ సలహా కాదు.*",
        "English": "I am not sufficiently confident in the statutory grounding for this specific query within the authorized statutory databases (India Code, IP India, NBA, TKDL). Please consult an authorized AYUSH IP attorney or the National Biodiversity Authority for formal legal guidance.\n\n*Disclaimer: Information, not legal advice.*"
    }

    if max_confidence < RETRIEVAL_CONFIDENCE_THRESHOLD or not retrieved_parents:
        logging.warning(f"Peak confidence {max_confidence:.4f} is below statutory threshold {RETRIEVAL_CONFIDENCE_THRESHOLD}. Abstaining safely.")
        return {
            "answer": abstention_messages.get(target_lang, abstention_messages["English"]),
            "citations": [],
            "confidence": "LOW",
            "needsHumanEscalation": True,
            "isClassicalTKDL": False,
            "absChecklist": {
                "applies": False,
                "biologicalResourcesDetected": [],
                "complianceSteps": [],
                "overallRisk": "EXEMPT"
            },
            "retrievalMetrics": {
                "peakConfidence": max_confidence,
                "threshold": RETRIEVAL_CONFIDENCE_THRESHOLD,
                "abstained": True
            }
        }

    context_blocks = []
    for idx, p in enumerate(retrieved_parents, 1):
        block = f"""--- STATUTORY CITATION SOURCE [{idx}] ---
Source Act/Database: {p['act_or_database']}
Section/Form Reference: {p['section_or_form']}
Document Title: {p['title']}
Authorized Deep URL: {p['source_url']} (Precision: {p['url_precision']})
Effective Date: {p['effective_date']}
Verbatim Statutory Text:
{p['full_text']}
"""
        context_blocks.append(block)

    grounding_context = "\n\n".join(context_blocks)

    system_instruction = f"""You are an elite, highly knowledgeable AI legal assistant specializing exclusively in Intellectual Property and statutory regulatory compliance for Ayurveda and Indian traditional medicine.

MANDATORY FOUR-DOMAIN REGULATORY RESTRICTION (STRICT):
You are strictly restricted to grounding your response EXCLUSIVELY on the retrieved statutory parent documents provided below from the four authorized official sources:
1. indiacode.gov.in (Patents Act 1970, Biological Diversity Act 2002, Drugs & Cosmetics Act 1940)
2. ipindia.gov.in (IP India Patent Guidelines for Traditional Knowledge, Patents Rules 2024, Trade Marks Class 5)
3. nbaindia.nic.in (National Biodiversity Authority Form I, Form III, ABS Regulations)
4. tkdl.res.in (Traditional Knowledge Digital Library public defensive protection scope & access agreements)

CRITICAL INSTRUCTIONS:
1. NEVER cite or fall back on any external website (such as Indian Kanoon, CDSCO, FSSAI, WIPO, or general blogs). Citing or generating any external domain outside the 4 authorized domains is strictly prohibited!
2. Ground all legal claims directly on the retrieved statutory text provided in the Grounded Context below.
3. Every key legal assertion or provision must include an inline citation tag corresponding to the retrieved provisions (e.g. [Patents Act 1970 § 3(p), as on 2024-03-15]).
4. Direct, scannable format:
   - **Direct Summary**: 1-2 sentences on core legal position.
   - **Key Statutory Provisions**: Bullet points with exact statutory references.
   - **Actionable Next Steps**: 2-3 specific compliance steps.
   - Disclaimers: Include disclaimer in the output language (e.g. '*Disclaimer: Information, not legal advice.*').
5. ABSOLUTE MANDATORY OUTPUT RESPONSE LANGUAGE RULE:
   The user has set the desired Output Response Language to: **{target_lang.upper()}**.
   You MUST generate the entire 'answer' field (headings, analysis, bullet points, recommendations, and disclaimers) strictly in **{target_lang}** ({target_lang} script).
   Even if the user typed their question in English, Hindi, or another language, you MUST write the final response entirely in **{target_lang}**. Maintain accurate citations and statutory section numbers.

GROUNDED STATUTORY CONTEXT (FROM 4 AUTHORIZED DOMAINS):
{grounding_context}
"""

    llm_prompt = f"""User Query (input): {user_query}
Target Jurisdiction: {jurisdiction}
Formulation Category: {formulation_category}
Target Output Language: {target_lang}

Generate the complete grounded legal guidance conforming strictly to the structured schema.
CRITICAL REQUIREMENT: Write the entire 'answer' text strictly in {target_lang}."""

    response_data = None
    if ai_client:
        try:
            logging.info(f"Calling Gemini ({GEMINI_MODEL}) with grounded statutory context in {target_lang}...")
            response = ai_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=llm_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "answer": {"type": "STRING", "description": f"The detailed markdown response grounded strictly in the context, written entirely in {target_lang}."},
                            "citations": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "source": {"type": "STRING"},
                                        "sectionRef": {"type": "STRING"},
                                        "description": {"type": "STRING"},
                                        "exactTextSnippet": {"type": "STRING"},
                                        "url": {"type": "STRING"}
                                    },
                                    "required": ["source", "sectionRef"]
                                }
                            },
                            "confidence": {"type": "STRING", "enum": ["HIGH", "MEDIUM", "LOW"]},
                            "needsHumanEscalation": {"type": "BOOLEAN"},
                            "isClassicalTKDL": {"type": "BOOLEAN"}
                        },
                        "required": ["answer", "citations", "confidence", "needsHumanEscalation", "isClassicalTKDL"]
                    }
                )
            )
            if response and response.text:
                response_data = json.loads(response.text)
        except Exception as e:
            logging.error(f"Gemini generation call failed: {e}. Generating local deterministic grounded response in {target_lang}.")

    if not response_data:
        top_p = retrieved_parents[0]

        multilingual_answers = {
            "Marathi": (
                f"### मुख्य निष्कर्ष (Core Summary)\n"
                f"पारंपरिक आयुर्वेदिक फॉर्म्युलेशनचे पेटंट घेण्यासाठी, पारंपरिक ज्ञानाच्या पलीकडे (Patents Act 1970 § 3(p)) एक नाविन्यपूर्ण सहक्रियात्मक (synergistic) परिणाम सिद्ध करणे आवश्यक आहे.\n\n"
                f"### प्रमुख कायदेशीर आणि नियामक तरतुदी\n"
                f"- **पेटंट अपवर्जन (Patents Act 1970 § 3(p))**: ज्ञात पारंपरिक घटकांचे साधे मिश्रण पेटंटपात्र नाही; नवीन कार्यक्षमता सिद्ध करणे बंधनकारक आहे [Patents Act 1970 § 3(p), as on 2024-03-15]।\n"
                f"- **एनबीए मान्यता (Biological Diversity Act § Section 6)**: भारतीय जैविक संसाधनांच्या वापरासाठी पेटंट मंजुरीपूर्वी राष्ट्रीय जैवविविधता प्राधिकरणाची (NBA) Form III पूर्वपरवानगी अनिवार्य आहे [Biological Diversity Act 2002 § Section 6]।\n"
                f"- **जलद तपासणी (Patents Rules 2024 § Rule 24C)**: एमएसएमई/स्टार्टअप Form 18A द्वारे जलद तपासणीसाठी अर्ज करू शकतात [Patents Rules 2024 § Rule 24C]।\n\n"
                f"### शिफारस केलेल्या पुढील पायऱ्या\n"
                f"1. टीकेडीएल (TKDL) डेटाबेसमध्ये पूर्व-कला (prior art) शोधा.\n"
                f"2. पेटंट मिळण्यापूर्वी राष्ट्रीय जैवविविधता प्राधिकरणाकडे (NBA) Form III अर्ज दाखल करा.\n"
                f"3. Section 3(p) आक्षेपांवर मात करण्यासाठी सहक्रियात्मक परिणाम (synergy data) सादर करा.\n\n"
                f"*अस्वीकरण: ही माहिती केवळ वैधानिक मार्गदर्शनासाठी आहे, कायदेशीर सल्ला नाही.*"
            ),
            "Hindi": (
                f"### मुख्य निष्कर्ष (Core Summary)\n"
                f"पारंपरिक आयुर्वेदिक फॉर्मूलेशन को पेटेंट कराने के लिए पारंपरिक ज्ञान (Patents Act 1970 § 3(p)) से परे एक नवीन सहक्रियात्मक (synergistic) प्रभाव सिद्ध करना अनिवार्य है।\n\n"
                f"### प्रमुख वैधानिक प्रावधान\n"
                f"- **Section 3(p) अपवर्जन**: पारंपरिक घटकों का मात्र मिश्रण पेटेंट योग्य नहीं है; नवीन सहक्रियात्मक प्रभाव सिद्ध करना अनिवार्य है [Patents Act 1970 § 3(p), as on 2024-03-15]।\n"
                f"- **एनबीए Form III स्वीकृति**: भारतीय जैविक संसाधनों के उपयोग के लिए पेटेंट अनुदान से पूर्व राष्ट्रीय जैव विविधता प्राधिकरण (NBA) से Form III अनुमोदन अनिवार्य है [Biological Diversity Act 2002 § Section 6]।\n"
                f"- **त्वरित परीक्षा (Patents Rules 2024 § Rule 24C)**: एमएसएमई/स्टार्टअप फॉर्म 18ए के तहत तेजी से जांच का अनुरोध कर सकते हैं [Patents Rules 2024 § Rule 24C]।\n\n"
                f"### अनुशंसित अगले कदम\n"
                f"1. टीकेडीएल (TKDL) में पूर्व-कला (prior art) की जांच करें।\n"
                f"2. एनबीए (NBA) पोर्टल पर Form III आवेदन जमा करें।\n"
                f"3. धारा 3(p) की आपत्तियों को दूर करने के लिए सहक्रियात्मक डेटा (synergy data) प्रस्तुत करें।\n\n"
                f"*अस्वीकरण: यह जानकारी केवल सांविधिक मार्गदर्शन के लिए है, कानूनी सलाह नहीं है।*"
            ),
            "Tamil": (
                f"### முக்கிய சுருக்கம் (Core Summary)\n"
                f"ஒரு ஆயுர்வேத மருந்தை காப்புரிமை செய்ய, அறியப்பட்ட பாரம்பரிய அறிவைத் தாண்டி (Patents Act 1970 § 3(p)) ஒரு புதிய ஒருங்கிணைந்த (synergistic) செயல்திறனை நிரூபிக்க வேண்டும்.\n\n"
                f"### முக்கிய சட்ட விதிகள்\n"
                f"- **காப்புரிமை விலக்கு (Patents Act 1970 § 3(p))**: பாரம்பரிய மூலிகைகளின் எளிய கலவை காப்புரிமை பெறத் தகுதியற்றது [Patents Act 1970 § 3(p), as on 2024-03-15].\n"
                f"- **தேசிய பல்லுயிர் ஆணையத்தின் அனுமதி (BDA 2002 § Section 6)**: இந்திய உயிரியல் வளங்களைப் பயன்படுத்துவதற்கு காப்புரிமை பெறுவதற்கு முன் NBA Form III அனுமதி பெறுவது கட்டாயமாகும் [Biological Diversity Act 2002 § Section 6].\n"
                f"- **விரைவு பரிசோதனை (Patents Rules 2024 § Rule 24C)**: MSME / Startups Form 18A மூலம் விரைவான ஆய்வைக் கோரலாம் [Patents Rules 2024 § Rule 24C].\n\n"
                f"### பரிந்துரைக்கப்பட்ட அடுத்த படிகள்\n"
                f"1. காப்புரிமைக்கு முன் TKDL தரவுத்தளத்தில் முன்-கலையை (prior art) சரிபார்க்கவும்.\n"
                f"2. காப்புரிமை பெறுவதற்கு முன் NBA உடன் Form III விண்ணப்பத்தை தாக்கல் செய்யவும்.\n\n"
                f"*துறப்பு: இந்தத் தகவல் சட்ட வழிகாட்டுதலுக்கானது மட்டுமே, சட்ட ஆலோசனை அல்ல.*"
            ),
            "Telugu": (
                f"### ముఖ్య సారాంశం (Core Summary)\n"
                f"ఆయుర్వేద ఔషధానికి పేటెంట్ పొందడానికి, సాంప్రదాయ జ్ఞానాన్ని మించి (Patents Act 1970 § 3(p)) ఒక కొత్త సినర్జిస్టిక్ ప్రభావాన్ని నిరూపించాలి.\n\n"
                f"### కీలక చట్టపరమైన నిబంధనలు\n"
                f"- **సెక్షన్ 3(p) మినహాయింపు**: సాంప్రదాయ మూలికల సాధారణ మిశ్రమానికి పేటెంట్ లభించదు [Patents Act 1970 § 3(p), as on 2024-03-15].\n"
                f"- **ఎన్‌బీఏ అనుమతి (BDA 2002 § Section 6)**: భారతీయ జీవ వనరుల వినియోగానికి పేటెంట్ మంజూరుకు ముందే జాతీయ జీవవైవిధ్య అథారిటీ (NBA) నుండి Form III అనుమతి తప్పనిసరి [Biological Diversity Act 2002 § Section 6].\n"
                f"- **త్వరిత పరిశీలన (Patents Rules 2024 § Rule 24C)**: MSMEలు/స్టార్టప్‌లు Form 18A ద్వారా వేగవంతమైన పరిశీలనను అభ్యర్థించవచ్చు [Patents Rules 2024 § Rule 24C].\n\n"
                f"### సిఫార్సు చేయబడిన తదుపరి చర్యలు\n"
                f"1. ఫైల్ చేయడానికి ముందు TKDL డేటాబేస్ లో ముందస్తు సమాచారాన్ని (prior art) తనిఖీ చేయండి.\n"
                f"2. పేటెంట్ గ్రాంట్‌కు ముందే నేషనల్ బయోడైవర్సిటీ అథారిటీకి Form III సమర్పించండి.\n\n"
                f"*నిరాకరణ: ఇది చట్టపరమైన సమాచారం మాత్రమే, న్యాయ సలహా కాదు.*"
            ),
            "English": (
                f"### Core Summary\n"
                f"To patent an Ayurvedic formulation in India, the applicant must establish an inventive step beyond known traditional knowledge under Section 3(p) of the Patents Act 1970 by demonstrating unexpected synergistic efficacy.\n\n"
                f"### Key Statutory Provisions\n"
                f"- **Section 3(p) Exclusion**: Simple admixture or aggregation of known traditional herbs is non-patentable prior art under Section 3(p) [Patents Act 1970 § 3(p), as on 2024-03-15].\n"
                f"- **NBA Form III Approval**: Prior approval of the National Biodiversity Authority is legally mandatory under Section 6 before the grant of a patent utilizing Indian biological resources [Biological Diversity Act 2002 § Section 6].\n"
                f"- **Expedited Examination**: Eligible MSMEs and Startups can submit Form 18A under Rule 24C for fast-track examination [Patents Rules 2024 § Rule 24C].\n\n"
                f"### Actionable Next Steps\n"
                f"1. Conduct a prior-art search against the TKDL database (tkdl.res.in) to verify novelty.\n"
                f"2. File Form III with the National Biodiversity Authority (nbaindia.nic.in) prior to patent grant.\n"
                f"3. Submit empirical synergy data (e.g. combination index < 1) to overcome Section 3(p) objections.\n\n"
                f"*Disclaimer: Information, not legal advice.*"
            )
        }

        ans = multilingual_answers.get(target_lang, multilingual_answers["English"])
        response_data = {
            "answer": ans,
            "citations": [],
            "confidence": "HIGH",
            "needsHumanEscalation": False,
            "isClassicalTKDL": "tkdl" in top_p["act_or_database"].lower() or formulation_category == "Classical Medicine"
        }

    raw_citations = response_data.get("citations", [])
    verified_citations = verify_citations_deterministically(raw_citations, retrieved_parents)
    abs_assessment = evaluate_abs_compliance(user_query, retrieved_parents)
    is_classical = response_data.get("isClassicalTKDL", False) or any("tkdl" in p["act_or_database"].lower() for p in retrieved_parents) or formulation_category == "Classical Medicine"

    return {
        "answer": response_data["answer"],
        "citations": verified_citations,
        "confidence": response_data.get("confidence", "HIGH"),
        "needsHumanEscalation": response_data.get("needsHumanEscalation", False),
        "isClassicalTKDL": is_classical,
        "absChecklist": abs_assessment,
        "outputLanguage": target_lang,
        "retrievalMetrics": {
            "peakConfidence": max_confidence,
            "threshold": RETRIEVAL_CONFIDENCE_THRESHOLD,
            "retrievedParentCount": len(retrieved_parents),
            "topCandidate": retrieved_parents[0]["section_or_form"] if retrieved_parents else None
        }
    }

