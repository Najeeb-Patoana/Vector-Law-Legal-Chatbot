const { pipeline } = require("@huggingface/transformers");

let modelPipeline = null;

async function initFilterModel() {
    if (!modelPipeline) {
        console.log("[MODEL] Loading local AI traffic director (MobileBERT)...");
        modelPipeline = await pipeline(
            "zero-shot-classification", 
            "Xenova/mobilebert-uncased-mnli"
        );
        console.log("[MODEL] AI Traffic director ready in memory.");
    }
}

/**
 * Evaluates user input against semantic labels.
 * @param {string} text - The raw user input.
 * @returns {Promise<boolean>} - Returns true if casual greeting, false if legal.
 */
async function isCasual(text) {
    // ── FAST PATH ONLY — no ML inference ──────────────────────────────────────
    // This function now ONLY checks a hardcoded exact-match list of common greetings.
    // All ML-based topic classification is handled by isLegalTopic().
    const cleanText = text.toLowerCase().trim().replace(/[^a-z\s]/g, "");
    
    const commonSmallTalk = [
        "hi", "hello", "hey", "yo", "sup", "greetings",
        "how are you", "how are you doing", "how is it going", 
        "whats up", "what is up", "who are you", "what are you",
        "thanks", "thank you", "bye", "goodbye"
    ];

    if (commonSmallTalk.includes(cleanText)) {
        console.log(`[FILTER] Fast-tracked as casual greeting: "${cleanText}"`);
        return true;
    }

    return false;
}

/**
 * Evaluates whether a user input is related to US law or legal topics.
 * @param {string} text - The raw user input.
 * @returns {Promise<boolean>} - Returns true if legal, false if off-topic.
 */
async function isLegalTopic(text) {
    if (!modelPipeline) {
        await initFilterModel();
    }

    const labels = [
        "a question about US law, legal rights, court cases, statutes, regulations, legal procedures, or legal concepts",
        "a question about programming, coding, software, technology, science, mathematics, history, entertainment, sports, or any non-legal subject",
    ];

    const result = await modelPipeline(text, labels);
    const topLabel = result.labels[0];
    const topScore = result.scores[0];

    console.log(`[TOPIC FILTER] Label: "${topLabel.substring(0, 60)}..." | Confidence: ${topScore.toFixed(2)}`);

    // If top label is the LEGAL one with meaningful confidence, it's on-topic
    if (topLabel === labels[0] && topScore > 0.40) {
        return true;
    }

    // If top label is the OFF-TOPIC one with strong confidence, block it
    if (topLabel === labels[1] && topScore > 0.55) {
        return false;
    }

    // Ambiguous — let it through to the LLM (the system prompt will handle it)
    return true;
}

module.exports = { initFilterModel, isCasual, isLegalTopic };