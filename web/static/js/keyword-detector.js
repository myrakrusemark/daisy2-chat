/**
 * Keyword Detection Service
 *
 * Provides unified keyword detection for both server (Whisper) and browser (Speech API) 
 * transcription results. Replaces wake word detection with flexible keyword matching.
 */

class KeywordDetector {
  constructor(keywords = window.CLAUDE_CONSTANTS?.DEFAULT_KEYWORDS || ['hey daisy']) {
    this.caseSensitive = false;
    this.fuzzyMatching = true;
    
    // Initialize with provided keywords (now supports multiple variations)
    this.setKeywords(keywords);
    
    console.log(`Keyword detector initialized with keywords: ${this.getAllVariations().join(', ')}`);
  }

  /**
   * Detect if transcription contains any configured keywords
   * @param {string} transcription - The transcribed text to analyze
   * @returns {Object} Detection result with keyword info and command extraction
   */
  detectKeyword(transcription) {
    if (!transcription || typeof transcription !== 'string') {
      return { found: false, fullText: transcription || '' };
    }

    const normalizedText = this._normalizeText(transcription);
    
    console.log(`Checking for keywords in: "${normalizedText}"`);
    console.log(`Available keyword variations: [${this.keywords.join(', ')}]`);

    // Check each configured keyword variation
    for (const keyword of this.keywords) {
      const result = this._checkKeywordMatch(normalizedText, keyword);
      if (result.found) {
        console.log(`✓ Keyword detected: "${keyword}" matched in "${normalizedText}"`);
        return result;
      }
    }

    console.log(`No keywords found in: "${normalizedText}"`);
    return { found: false, fullText: normalizedText, checkedKeywords: this.keywords };
  }

  /**
   * Check if specific keyword matches in text with fuzzy matching
   * @private
   */
  _checkKeywordMatch(text, keyword) {
    const normalizedKeyword = this._normalizeText(keyword);
    const matchIndex = text.indexOf(normalizedKeyword);
    
    if (matchIndex !== -1) {
      // Extract command text after the keyword
      const commandStartIndex = matchIndex + normalizedKeyword.length;
      const rawCommandText = text.substring(commandStartIndex);
      const commandText = this._cleanCommandText(rawCommandText);
      
      return {
        found: true,
        keyword: keyword,
        matchedVariation: normalizedKeyword,
        matchIndex: matchIndex,
        command: commandText,
        fullText: text,
        confidence: 1.0
      };
    }
    
    return { found: false };
  }

  /**
   * Clean command text by removing leading punctuation/whitespace and capitalizing first letter
   * @private
   */
  _cleanCommandText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return '';
    }
    
    // Remove leading whitespace and punctuation
    const cleaned = rawText.replace(/^[\s.,!?;:'"()[\]{}\-_+=*&^%$#@~`|\\/<>]+/, '').trim();
    
    // Capitalize first letter if text exists
    if (cleaned.length > 0) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    return cleaned;
  }

  /**
   * Normalize text for consistent matching (lowercase, strip punctuation, trim whitespace)
   * @private
   */
  _normalizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  /**
   * Get all keyword variations as a flat array
   */
  getAllVariations() {
    return [...this.keywords];
  }

  /**
   * Update keyword configuration - supports both arrays and strings
   */
  updateKeywords(keywords) {
    if (typeof keywords === 'string') {
      // Parse string input (newline or comma-separated)
      keywords = keywords.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 0);
    }
    
    if (!Array.isArray(keywords)) {
      console.error('Keywords must be an array or string');
      return false;
    }
    
    this.keywords = keywords.map(k => k.trim()).filter(k => k.length > 0);
    console.log(`Keywords updated: ${this.keywords.join(', ')}`);
    return true;
  }

  /**
   * Set keywords (alias for updateKeywords for consistency)
   */
  setKeywords(keywords) {
    return this.updateKeywords(keywords);
  }

  /**
   * Add a keyword to the detection list
   */
  addKeyword(keyword) {
    if (!keyword || typeof keyword !== 'string') {
      console.error('Invalid keyword provided');
      return false;
    }
    
    const cleanKeyword = keyword.toLowerCase().trim();
    if (!this.keywords.includes(cleanKeyword)) {
      this.keywords.push(cleanKeyword);
      console.log(`Keyword added: "${cleanKeyword}"`);
      return true;
    }
    
    console.log(`Keyword already exists: "${cleanKeyword}"`);
    return false;
  }

  /**
   * Remove a keyword from the detection list
   */
  removeKeyword(keyword) {
    if (!keyword || typeof keyword !== 'string') {
      console.error('Invalid keyword provided');
      return false;
    }
    
    const cleanKeyword = keyword.toLowerCase().trim();
    const index = this.keywords.indexOf(cleanKeyword);
    if (index > -1) {
      this.keywords.splice(index, 1);
      console.log(`Keyword removed: "${cleanKeyword}"`);
      return true;
    }
    
    console.log(`Keyword not found: "${cleanKeyword}"`);
    return false;
  }

  /**
   * Get current keyword configuration
   */
  getKeywords() {
    return [...this.keywords]; // Return copy to prevent external modification
  }

  /**
   * Enable/disable fuzzy matching
   */
  setFuzzyMatching(enabled) {
    this.fuzzyMatching = !!enabled;
    console.log(`Fuzzy matching ${this.fuzzyMatching ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable case sensitivity
   */
  setCaseSensitive(enabled) {
    this.caseSensitive = !!enabled;
    console.log(`Case sensitivity ${this.caseSensitive ? 'enabled' : 'disabled'}`);
  }

  /**
   * Add custom keyword variations for fuzzy matching
   */
  addKeywordVariations(keyword, variations) {
    if (!keyword || !Array.isArray(variations)) {
      console.error('Invalid keyword or variations provided');
      return false;
    }
    
    const cleanKeyword = keyword.toLowerCase().trim();
    const cleanVariations = variations.map(v => v.toLowerCase().trim()).filter(v => v.length > 0);
    
    if (!this.keywordVariations[cleanKeyword]) {
      this.keywordVariations[cleanKeyword] = [cleanKeyword];
    }
    
    // Add new variations, avoiding duplicates
    for (const variation of cleanVariations) {
      if (!this.keywordVariations[cleanKeyword].includes(variation)) {
        this.keywordVariations[cleanKeyword].push(variation);
      }
    }
    
    console.log(`Added variations for "${cleanKeyword}": ${cleanVariations.join(', ')}`);
    return true;
  }

  /**
   * Get detection statistics (useful for debugging)
   */
  getStats() {
    return {
      keywordCount: this.keywords.length,
      fuzzyMatchingEnabled: this.fuzzyMatching,
      caseSensitive: this.caseSensitive,
      totalVariations: Object.values(this.keywordVariations).reduce((sum, variations) => sum + variations.length, 0)
    };
  }

  /**
   * Test keyword detection with sample text (useful for debugging)
   */
  testDetection(sampleText) {
    console.log(`Testing keyword detection with: "${sampleText}"`);
    const result = this.detectKeyword(sampleText);
    console.log('Detection result:', result);
    return result;
  }
}

// Export for use in other modules
window.KeywordDetector = KeywordDetector;