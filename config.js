/**
 * SafeSpend Configuration
 * Default configuration values
 */

const SAFESPEND_CONFIG = {
  // These will be overridden by values from chrome.storage
  SUPABASE_URL: 'https://pckmryieldvwbjjrckex.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBja21yeWllbGR2d2JqanJja2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ3MjEsImV4cCI6MjA4NjMwMDcyMX0.46aphX7b0qkYshKKyeP9elhgr2Xo2vAJnZmDl9kbX_w',
  
  // Edge function path
  EDGE_FUNCTION_PATH: '/functions/v1/evaluate-purchase',
  
  // Purchase detection keywords
  PURCHASE_KEYWORDS: [
    'buy', 'checkout', 'pay', 'purchase', 'order now',
    'add to cart', 'complete order', 'place order',
    'proceed to checkout', 'buy now', 'pay now'
  ],
  
  // Price regex patterns
  PRICE_PATTERNS: [
    /[\$\€\£\¥\₹]\s*[\d,]+(?:\.\d{2})?/gi,
    /[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|JPY|INR|\$|\€|\£|\¥|\₹)/gi
  ],
  
  // Maximum page text length to send
  MAX_TEXT_LENGTH: 3000,
  
  // Debounce time for clicks (ms)
  CLICK_DEBOUNCE: 500,
  
  // Notification duration (ms)
  NOTIFICATION_DURATION: {
    APPROVE: 5000,
    WARN: 8000,
    BLOCK: 8000
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SAFESPEND_CONFIG;
}
