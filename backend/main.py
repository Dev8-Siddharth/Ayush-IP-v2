"""
AyushIP FastAPI Backend Server.
Runs on HOST=127.0.0.1, PORT=8000.
Exposes:
- POST /api/gemini/chat (Full RAG Pipeline with 4-domain grounding & citation verification)
- POST /api/abs/check (Dedicated ABS Assessment)
- GET /api/health (Health check and corpus statistics)
- GET /api/citations/sample (Sample citations from the four authorized domains)
"""

import os
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

load_dotenv()

from rag_service import (
    generate_rag_response, 
    evaluate_abs_compliance,
    parents_registry, 
    children_registry, 
    retrieve_hybrid_candidates,
    expand_to_parents
)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s - %(message)s")

app = FastAPI(title="AyushIP Statutory RAG Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str
    citations: Optional[List[Dict[str, Any]]] = None
    confidence: Optional[str] = None
    needsHumanEscalation: Optional[bool] = None
    isClassicalTKDL: Optional[bool] = None
    absChecklist: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    jurisdiction: Optional[str] = "India"
    formulationCategory: Optional[str] = "Unknown"
    outputLanguage: Optional[str] = "Auto"

class AbsCheckRequest(BaseModel):
    query: str
    jurisdiction: Optional[str] = "India"
    formulationCategory: Optional[str] = "Unknown"

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "engine": "AyushIP Statutory RAG",
        "total_parent_sections": len(parents_registry),
        "total_child_clauses": len(children_registry),
        "authorized_domains": [
            "indiacode.gov.in",
            "ipindia.gov.in",
            "nbaindia.nic.in",
            "tkdl.res.in"
        ],
        "confidence_threshold": float(os.getenv("RETRIEVAL_CONFIDENCE_THRESHOLD", "0.35")),
        "model": os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    }

@app.post("/api/gemini/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        dict_messages = [m.model_dump() for m in req.messages]
        result = generate_rag_response(
            messages=dict_messages,
            jurisdiction=req.jurisdiction or "India",
            formulation_category=req.formulationCategory or "Unknown",
            output_language=req.outputLanguage or "Auto"
        )
        return result
    except Exception as e:
        logging.error(f"Error in /api/gemini/chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/abs/check")
async def abs_check_endpoint(req: AbsCheckRequest):
    try:
        candidates = retrieve_hybrid_candidates(req.query, top_y=5, jurisdiction=req.jurisdiction)
        parents = expand_to_parents(candidates)
        assessment = evaluate_abs_compliance(req.query, parents)
        return assessment
    except Exception as e:
        logging.error(f"Error in /api/abs/check: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/citations/sample")
def sample_citations():
    """
    Returns verified sample citations across all 4 domains for instant verification.
    """
    samples = []
    seen = set()
    for p in parents_registry.values():
        src = p["source"]
        if src not in seen:
            seen.add(src)
            samples.append({
                "source": f"{p['act_or_database']} - {p['section_or_form']}",
                "sectionRef": p["section_or_form"],
                "portal": src,
                "url": p["source_url"],
                "url_precision": p["url_precision"],
                "effective_date": p["effective_date"],
                "jurisdiction": p["jurisdiction"],
                "snippet": p["full_text"][:150] + "..."
            })
    return {"sample_citations": samples}

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    logging.info(f"Starting AyushIP FastAPI Server on http://{host}:{port}...")
    uvicorn.run(app, host=host, port=port)

