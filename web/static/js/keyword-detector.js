/**
 * Keyword Detection Service
 *
 * Provides unified keyword detection for both server (Whisper) and browser (Speech API) 
 * transcription results. Replaces wake word detection with flexible keyword matching.
 */

class KeywordDetector {
  constructor(keywords = window.CLAUDE_CONSTANTS?.DEFAULT_KEYWORDS || ['hey daisy', 'daisy']) {
    this.keywords = keywords.map(k => k.toLowerCase().trim());
    this.caseSensitive = false;
    this.fuzzyMatching = true;
    
    // Fuzzy matching variations for common speech recognition errors
    this.keywordVariations = {
      'hey daisy': ['hey daisy', 'hay daisy', 'hey daisey', 'hay daisey', 'hey dazy', 'hai daisy'],
      'daisy': ['daisy', 'daisey', 'dazy', 'daisie']
    };
    
    console.log(`Keyword detector initialized with keywords: ${this.keywords.join(', ')}`);
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

    const text = this.caseSensitive ? transcription.trim() : transcription.toLowerCase().trim();
    
    console.log(`Checking for keywords in: "${text}"`);

    // Check each configured keyword
    for (const keyword of this.keywords) {
      const result = this._checkKeywordMatch(text, keyword);
      if (result.found) {
        console.log(`✓ Keyword detected: "${keyword}" in "${text}"`);
        return result;
      }
    }

    console.log(`No keywords found in: "${text}"`);
    return { found: false, fullText: text, checkedKeywords: this.keywords };
  }

  /**
   * Check if specific keyword matches in text with fuzzy matching
   * @private
   */
  _checkKeywordMatch(text, keyword) {
    const variations = this.fuzzyMatching ? this._getKeywordVariations(keyword) : [keyword];
    
    for (const variation of variations) {
      const matchIndex = text.indexOf(variation);
      if (matchIndex !== -1) {
        // Extract command text after the keyword
        const commandStartIndex = matchIndex + variation.length;
        const commandText = text.substring(commandStartIndex).trim();
        
        return {
          found: true,
          keyword: keyword,
          matchedVariation: variation,
          matchIndex: matchIndex,
          command: commandText,
          fullText: text,
          confidence: variation === keyword ? 1.0 : 0.9 // Lower confidence for fuzzy matches
        };
      }
    }
    
    return { found: false };
  }

  /**
   * Get variations of a keyword for fuzzy matching
   * @private
   */
  _getKeywordVariations(keyword) {
    const variations = this.keywordVariations[keyword] || [keyword];
    return [...new Set(variations)]; // Remove duplicates
  }

  /**
   * Update keyword configuration
   */
  updateKeywords(keywords) {
    if (!Array.isArray(keywords)) {
      console.error('Keywords must be an array');
      return false;
    }
    
    this.keywords = keywords.map(k => k.toLowerCase().trim()).filter(k => k.length > 0);
    console.log(`Keywords updated: ${this.keywords.join(', ')}`);
    return true;
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