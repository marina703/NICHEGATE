// Token Bucket rate limiter for outgoing API requests
// Implements token bucket algorithm for rate limiting with burst capacity

class TokenBucket {
  /**
   * @param {number} refillRate - Number of tokens to add per second
   * @param {number} capacity - Maximum number of tokens in the bucket
   */
  constructor(refillRate, capacity) {
    this.refillRate = refillRate; // tokens per second
    this.capacity = capacity; // max tokens
    this.tokens = capacity; // start with full bucket
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const secondsElapsed = (now - this.lastRefill) / 1000;
    const newTokens = secondsElapsed * this.refillRate;
    
    if (newTokens > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume a token
   * @returns {boolean} true if token was consumed, false if not enough tokens
   */
  tryConsume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Wait for a token to be available (uses setTimeout)
   * @returns {Promise<void>} resolves when a token is consumed
   */
  async waitForToken() {
    return new Promise((resolve) => {
      const attempt = () => {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          // Try again after a short interval
          setTimeout(attempt, 100); // 100ms interval
        }
      };
      attempt();
    });
  }

  /**
   * Get current token count (for monitoring/debugging)
   * @returns {number} current token count
   */
  getTokens() {
    this.refill();
    return this.tokens;
  }
}

module.exports = { TokenBucket };