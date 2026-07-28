const { pipeline } = require("@huggingface/transformers");

let _reranker = null;

// ── Configuration ─────────────────────────────────────────────────────────────
const MODEL_ID = "jinaai/jina-reranker-v1-turbo-en";
const TOP_K    = 5;

// ── initializeReranker ────────────────────────────────────────────────────────

/**
 *
 * @throws {Error} If the HuggingFace pipeline fails to load.
 */
async function initializeReranker() {
    if (_reranker) return; // already loaded — nothing to do

    console.log(`[Reranker] Loading model: ${MODEL_ID} …`);

    try {
        // "text-classification" maps to the cross-encoder architecture.
        // The model outputs a single relevance score per (query, passage) pair.
        // dtype "q8" cuts RAM roughly in half vs fp32 with negligible accuracy loss.
        _reranker = await pipeline("text-classification", MODEL_ID, { dtype: "q8" });
        console.log("[Reranker] Ready");
    } catch (err) {
        // Re-throw with a human-readable message so the startup log is clear.
        throw new Error(`[Reranker] Failed to load model "${MODEL_ID}": ${err.message}`);
    }
}

// ── rerank ────────────────────────────────────────────────────────────────────

/**
 * Score every document against the question using the cross-encoder,
 * sort by score descending, and return only the top K.
 *
 * The cross-encoder reads both the question and the passage together
 * (unlike the bi-encoder used for embedding), giving much more accurate
 * relevance scores at the cost of being O(n) in the number of documents.
 *
 * @param {string}   question  - The user's raw question.
 * @param {object[]} documents - Qdrant payload objects, each must have a `text` field.
 * @returns {Promise<object[]>} Top-K documents with `rerankScore` attached, sorted desc.
 */
async function rerank(question, documents) {
    // This should never happen if initializeReranker() was called at startup,
    // but we handle it defensively to avoid a silent null-dereference crash.
    if (!_reranker) {
        throw new Error("[Reranker] Model is not loaded. Call initializeReranker() first.");
    }

    if (!documents || documents.length === 0) return [];

    console.log(`[Reranker] Reranking ${documents.length} documents…`);

    // Build (query, passage) pairs — the format the cross-encoder expects.
    // We extract `text` from the Qdrant payload for the passage side.
    const pairs = documents.map((doc) => ({
        text:       question,          // sentence A — the query
        text_pair:  doc.text || "",    // sentence B — the candidate passage
    }));

    // Run inference over all pairs in a single batched call.
    // `top_k: null` tells the pipeline to return ALL scores (not just the top-1).
    const scores = await _reranker(pairs, { top_k: null });

    // `scores` is an array of { label, score } objects in the same order as `pairs`.
    // The cross-encoder label is typically "LABEL_1" for relevant or a float score
    // depending on the model head — we always use the numeric `.score` field.
    const ranked = documents
        .map((doc, i) => ({
            ...doc,                             
            rerankScore: scores[i]?.score ?? 0, 
        }))
        .sort((a, b) => b.rerankScore - a.rerankScore) 
        .slice(0, TOP_K);                              

    console.log(`[Reranker] Selected Top ${ranked.length}`);

    return ranked;
}

module.exports = { initializeReranker, rerank };
