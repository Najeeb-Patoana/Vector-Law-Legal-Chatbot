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
    if (!modelPipeline) {
        await initFilterModel();
    }

    // ── 1. THE FAST PATH ──────────────────────────────────────────────────────
    // Strip out punctuation (e.g., "how are you?" becomes "how are you")
    const cleanText = text.toLowerCase().trim().replace(/[^a-z\s]/g, "");
    
    const commonSmallTalk = [
        "hi", "hello", "hey", "yo", "sup", "greetings",
        "how are you", "how are you doing", "how is it going", 
        "whats up", "what is up", "who are you", "what are you",
        "thanks", "thank you", "bye", "goodbye"
    ];

    if (commonSmallTalk.includes(cleanText)) {
        console.log(`[FILTER] Fast-tracked as casual: "${cleanText}"`);
        return true;
    }

    // ── 2. THE ML PATH ────────────────────────────────────────────────────────
    // We tweaked the labels so "questions" doesn't confuse the AI
    const labels = [
        "casual small talk, conversational greetings, or pleasantries", 
        "specific legal inquiries or statutory issues"
    ];
    
    const result = await modelPipeline(text, labels);
    const topLabel = result.labels[0];
    const topScore = result.scores[0];

    console.log(`[FILTER] Label: "${topLabel}" | Confidence: ${topScore.toFixed(2)}`);

    // Lowered threshold slightly to 0.45 just to be safe
    if (topLabel === "casual small talk, conversational greetings, or pleasantries" && topScore > 0.45) {
        return true;
    }
    
    return false;
}

module.exports = { initFilterModel, isCasual };