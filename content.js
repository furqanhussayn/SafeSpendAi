/**
 * SafeSpend Content Script
 * Detects purchase intent and scrapes page data
 */

// Hardcoded Supabase config (shared instance)
const SUPABASE_URL = 'https://pckmryieldvwbjjrckex.supabase.co'; // REPLACE WITH YOUR URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBja21yeWllbGR2d2JqanJja2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ3MjEsImV4cCI6MjA4NjMwMDcyMX0.46aphX7b0qkYshKKyeP9elhgr2Xo2vAJnZmDl9kbX_w'; // REPLACE WITH YOUR ANON KEY
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/evaluate-purchase`;

// Demo account fallback
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000';

// Configuration
const CONFIG = {
  PURCHASE_KEYWORDS: [
    'buy','buy now','add to cart','add to basket','checkout','check out','pay','pay now','order','order now','place order','complete order','confirm order',
    'purchase','purchase now','subscribe','subscribe now','renew','renew subscription','donate','donate now','book','book now','reserve','reserve now',
    'buy ticket','get tickets','checkout now','finish purchase','proceed to payment','continue to payment','confirm purchase','top up','recharge','pay bill',
    'pay order','place booking','reserve seat','buy subscription','purchase subscription','one click buy'
  ],
  PRICE_REGEX: /[\$\€\£\¥\₹]\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|JPY|INR|\$|\€|\£|\¥|\₹)/gi,
  MAX_TEXT_LENGTH: 3000,
  DEBOUNCE_MS: 500
};

// Compile purchase keyword regexes (whole-word/phrase, case-insensitive)
CONFIG.PURCHASE_REGEXES = CONFIG.PURCHASE_KEYWORDS.map(k => {
  // escape regex chars
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + esc + '\\b', 'i');
});

// How long to ignore repeated purchases for the same product (ms)
CONFIG.PRODUCT_LOCK_MS = 60 * 1000; // 1 minute
// State
// Track processing per-product to avoid duplicate requests
const processingKeys = new Set();
// Track recently handled products to dedupe frequent clicks
const processedProducts = new Map(); // key -> timestamp
let isProcessing = false;
let lastClickTime = 0;
let currentUserId = null;

/**
 * Get logged in user ID from storage
 */
async function getUserId() {
  const result = await chrome.storage.local.get(['safespend_user']);
  if (result.safespend_user && result.safespend_user.id) {
    return result.safespend_user.id;
  }
  // Fallback to demo account
  return DEMO_USER_ID;
}

/**
 * Check if user is logged in
 */
async function isLoggedIn() {
  const result = await chrome.storage.local.get(['safespend_session']);
  return !!result.safespend_session;
}

/**
 * Check if text contains purchase-related keywords
 */
function isPurchaseIntent(text) {
  if (!text) return false;
  // Check using compiled whole-word regexes first
  for (const re of CONFIG.PURCHASE_REGEXES) {
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Extract price from page text
 */
function extractPrice(text) {
  const matches = text.match(CONFIG.PRICE_REGEX);
  if (matches && matches.length > 0) {
    const priceStr = matches[0];
    const numericValue = parseFloat(priceStr.replace(/[^\d.]/g, ''));
    return isNaN(numericValue) ? null : numericValue;
  }
  return null;
}

/**
 * Scrape page data safely (no form inputs, no sensitive data)
 */
function scrapePageData() {
  try {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Get visible text only (no inputs, no scripts, no styles)
    const bodyClone = document.body.cloneNode(true);
    
    // Remove sensitive elements
    const sensitiveSelectors = [
      'input', 'textarea', 'select', 'button[type="submit"]',
      'script', 'style', 'noscript', 'iframe',
      '[type="password"]', '[type="email"]',
      '.payment', '.checkout-form', '.credit-card'
    ];
    
    sensitiveSelectors.forEach(selector => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // Get text content
    let pageText = bodyClone.innerText || bodyClone.textContent || '';
    
    // Clean and limit text
    pageText = pageText
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, CONFIG.MAX_TEXT_LENGTH);

    // Extract price
    const price = extractPrice(pageText);

    return {
      url,
      hostname,
      price,
      page_text: pageText
    };
  } catch (error) {
    console.error('[SafeSpend] Error scraping page:', error);
    return {
      url: window.location.href,
      hostname: window.location.hostname,
      price: null,
      page_text: ''
    };
  }
}

/**
 * Send data to Supabase Edge Function
 */
async function evaluatePurchase(data) {
  try {
    // Get user ID
    const userId = await getUserId();
    
    const result = await chrome.storage.local.get(['safespend_session']);
    const token = result.safespend_session?.access_token;

    // Build headers: always include anon apikey, include Authorization with session token or anon key
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    };
    if (token && typeof token === 'string' && token.split('.').length === 3) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // Ensure Supabase gateway receives an Authorization header — use anon key when no session
      headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...data,
        user_id: userId
      })
    });

    // Try to parse response body for clearer error messages
    const text = await response.text().catch(() => null);
    let bodyJson = null;
    try { bodyJson = text ? JSON.parse(text) : null; } catch (e) { bodyJson = null; }

    if (!response.ok) {
      if (response.status === 401) {
        return { decision: 'WARN', reason: 'Unauthorized - please login' };
      }
      if (bodyJson && bodyJson.reason) {
        return { decision: bodyJson.decision || 'WARN', reason: bodyJson.reason };
      }
      return { decision: 'WARN', reason: `Server error: ${response.status}` };
    }

    // If response is OK, prefer parsed JSON
    if (bodyJson) return bodyJson;
    const result_data = await response.json();
    return result_data;
  } catch (error) {
    console.error('[SafeSpend] Error calling Edge Function:', error);
    // Fallback to WARN on network failure
    return { decision: 'WARN', reason: 'Network error - please check connection' };
  }
}

/**
 * Show login required notification
 */
function showLoginRequired() {
  const feedback = document.createElement('div');
  feedback.id = 'safespend-login-required';
  
  feedback.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: #6366f1;
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 320px;
      animation: safespend-slide-in 0.3s ease-out;
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">🔐</span>
        <div>
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Login Required</div>
          <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">Please login to SafeSpend to enable purchase protection.</div>
        </div>
      </div>
      <button id="safespend-login-btn" style="
        margin-top: 12px;
        width: 100%;
        padding: 8px 16px;
        background: white;
        color: #6366f1;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
      ">Open SafeSpend</button>
      <button onclick="this.closest('#safespend-login-required').remove()" style="
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        opacity: 0.7;
      ">×</button>
    </div>
  `;

  // Add animation styles
  if (!document.getElementById('safespend-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'safespend-styles';
    styleEl.textContent = `
      @keyframes safespend-slide-in {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  document.body.appendChild(feedback);

  // Add click handler for login button
  feedback.querySelector('#safespend-login-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
    feedback.remove();
  });

  // Auto-remove after 10 seconds
  setTimeout(() => {
    feedback.remove();
  }, 10000);
}

/**
 * Show visual feedback based on decision
 */
function showDecisionFeedback(result) {
  // Remove any existing feedback
  const existing = document.getElementById('safespend-feedback');
  if (existing) existing.remove();
  const decision = result?.decision || 'WARN';
  const reason = result?.reason || '';
  const ui = result?.ui || null;

  // Ensure animation styles exist
  if (!document.getElementById('safespend-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'safespend-styles';
    styleEl.textContent = `
      @keyframes safespend-slide-in {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Helper to open chat link
  function openChat(url) {
    try { window.open(url, '_blank'); } catch (e) { console.log('Open chat', e); }
  }

  // Notification (small toast)
  if (!ui || ui.type === 'notification') {
    const feedback = document.createElement('div');
    feedback.id = 'safespend-feedback';
    const bg = decision === 'APPROVE' ? '#10b981' : (decision === 'BLOCK' ? '#ef4444' : '#f59e0b');
    const icon = decision === 'APPROVE' ? '✓' : (decision === 'BLOCK' ? '✕' : '⚠');
    const title = decision === 'APPROVE' ? 'Purchase Approved' : (decision === 'BLOCK' ? 'Purchase Blocked' : 'Purchase Warning');

    feedback.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        background: ${bg};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 360px;
        animation: safespend-slide-in 0.3s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px;">${icon}</span>
          <div>
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 13px; opacity: 0.95; line-height: 1.4;">${reason}</div>
          </div>
        </div>
        <button id="safespend-feedback-close" style="
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 18px;
          opacity: 0.9;
        ">×</button>
      </div>
    `;

    document.body.appendChild(feedback);
    document.getElementById('safespend-feedback-close').addEventListener('click', () => feedback.remove());

    const duration = decision === 'APPROVE' ? 4000 : 8000;
    setTimeout(() => { feedback.remove(); }, duration);
    return;
  }

  // Alert (smaller modal-like alert with actions)
  if (ui.type === 'alert') {
    const feedback = document.createElement('div');
    feedback.id = 'safespend-feedback';
    feedback.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; z-index: 999999; background: #f59e0b; color: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; animation: safespend-slide-in 0.3s ease-out;">
        <div style="font-weight: 700; margin-bottom: 8px;">${ui.title || 'Warning'}</div>
        <div style="font-size:13px; opacity:0.95; margin-bottom:12px;">${ui.message || reason}</div>
        <div style="display:flex; gap:8px;">
          <button id="safespend-action-chat" style="flex:1; padding:10px; border-radius:8px; border:none; background:white; color:#f59e0b; font-weight:700; cursor:pointer;">${(ui.actions&&ui.actions[0]&&ui.actions[0].label) || 'Chat'}</button>
          <button id="safespend-action-proceed" style="flex:1; padding:10px; border-radius:8px; border:none; background:rgba(0,0,0,0.08); color:white; font-weight:700; cursor:pointer;">${(ui.actions&&ui.actions[1]&&ui.actions[1].label) || 'Proceed Anyway'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(feedback);
    document.getElementById('safespend-action-chat').addEventListener('click', () => {
      const url = (ui.actions && ui.actions[0] && ui.actions[0].url) || 'https://www.google.com';
      openChat(url);
    });
    document.getElementById('safespend-action-proceed').addEventListener('click', () => {
      document.getElementById('safespend-feedback')?.remove();
    });
    return;
  }

  // Modal (blocking-looking overlay)
  if (ui.type === 'modal') {
    const overlay = document.createElement('div');
    overlay.id = 'safespend-feedback';
    overlay.innerHTML = `
      <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000000;">
        <div style="background:white; color:#111; padding:24px; border-radius:14px; width:90%; max-width:560px; box-shadow:0 20px 60px rgba(0,0,0,0.6); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="font-size:20px; font-weight:800; margin-bottom:8px;">${ui.title || 'Purchase Blocked'}</div>
          <div style="font-size:14px; margin-bottom:16px; color:#333;">${ui.message || reason}</div>
          <div style="display:flex; gap:12px;">
            <button id="safespend-modal-chat" style="flex:1; padding:12px; border-radius:10px; border:none; background:#2563eb; color:white; font-weight:700; cursor:pointer;">${(ui.actions&&ui.actions[0]&&ui.actions[0].label) || 'Chat with Poyo'}</button>
            <button id="safespend-modal-cancel" style="flex:1; padding:12px; border-radius:10px; border:none; background:#ef4444; color:white; font-weight:700; cursor:pointer;">${(ui.actions&&ui.actions[1]&&ui.actions[1].label) || 'Cancel Purchase'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('safespend-modal-chat').addEventListener('click', () => {
      const url = (ui.actions && ui.actions[0] && ui.actions[0].url) || 'https://www.google.com';
      openChat(url);
    });
    document.getElementById('safespend-modal-cancel').addEventListener('click', () => {
      // Close overlay
      document.getElementById('safespend-feedback')?.remove();
      // Optionally show a small message
      const note = document.createElement('div');
      note.style.position = 'fixed';
      note.style.bottom = '20px';
      note.style.left = '50%';
      note.style.transform = 'translateX(-50%)';
      note.style.background = '#ef4444';
      note.style.color = 'white';
      note.style.padding = '10px 14px';
      note.style.borderRadius = '10px';
      note.style.zIndex = '1000001';
      note.textContent = 'Purchase cancelled';
      document.body.appendChild(note);
      setTimeout(() => note.remove(), 3000);
    });
    return;
  }
}

/**
 * Handle click events
 */
async function handleClick(event) {
  // Debounce
  const now = Date.now();
  if (now - lastClickTime < CONFIG.DEBOUNCE_MS) return;
  lastClickTime = now;


    // Expand purchase keywords to cover many button labels/phrases
    // (kept in CONFIG to be editable)
    CONFIG.PURCHASE_KEYWORDS = [
      'buy','buy now','add to cart','add to basket','checkout','check out','pay','pay now','order','order now','place order','complete order','confirm order',
      'purchase','purchase now','subscribe','subscribe now','renew','renew subscription','donate','donate now','book','book now','reserve','reserve now',
      'buy ticket','get tickets','checkout now','finish purchase','proceed to payment','continue to payment','confirm purchase','top up','recharge','pay bill'
    ];

    // Only treat clicks on actual button-like elements as purchase actions
    let target = event.target;
    function findClosestClickable(el) {
      while (el && el !== document.body) {
        const tag = el.tagName && el.tagName.toLowerCase();
        const type = el.getAttribute && (el.getAttribute('type') || '').toLowerCase();
        const role = el.getAttribute && el.getAttribute('role');

        // Accept real buttons
        if (tag === 'button') return el;

        // Accept input buttons/submits/images
        if (tag === 'input' && ['button','submit','image'].includes(type)) return el;

        // Accept links (<a>) that look like actions (have href)
        if (tag === 'a' && el.getAttribute && el.getAttribute('href')) return el;

        // Accept any element explicitly marked as a button role
        if (role === 'button') return el;

        // Accept elements with inline onclick handlers (ads or custom clickable containers)
        if ((el.getAttribute && el.getAttribute('onclick')) || typeof el.onclick === 'function') return el;

        // If the element looks like an ad container (class/data attributes), try to find an inner clickable
        try {
          const cls = (el.className || '').toString().toLowerCase();
          const isAdContainer = /(^|\s)(ad|ads|sponsored|banner|promo)(\s|$)/.test(cls) || el.getAttribute && (el.getAttribute('data-ad') || el.getAttribute('data-ads') || el.getAttribute('data-sponsored'));
          if (isAdContainer) {
            // prefer inner anchor or button
            const innerClickable = el.querySelector('a[href], button, input[type="button"], input[type="submit"]');
            if (innerClickable) return innerClickable;
            // otherwise treat the container if it has click handler
            if (el.getAttribute && el.getAttribute('onclick')) return el;
          }
        } catch (e) {
          // ignore DOM access errors
        }

        el = el.parentElement;
      }
      return null;
    }

  const clickable = findClosestClickable(target);
  if (!clickable) return;

  // Include element attributes and dataset when deciding intent (aria-label, title, alt, data-*)
  let attrText = '';
  try {
    const aria = clickable.getAttribute && clickable.getAttribute('aria-label');
    const title = clickable.getAttribute && clickable.getAttribute('title');
    const alt = clickable.getAttribute && clickable.getAttribute('alt');
    const dataVals = clickable.dataset ? Object.values(clickable.dataset).join(' ') : '';
    attrText = [aria, title, alt, dataVals].filter(Boolean).join(' ');
  } catch (e) {
    attrText = '';
  }

  const elementText = ((clickable.innerText || clickable.textContent || clickable.value || '') + ' ' + attrText).trim();

  // Check if it's a purchase-related click (button text, attributes or dataset)
  if (!isPurchaseIntent(elementText)) return;

  // Check if logged in
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    showLoginRequired();
    return;
  }

  // Scrape minimal page data early to build a dedupe key
  const pageDataPreview = scrapePageData();

  // Build a product key to dedupe repeated clicks on the same product
  const productIdCandidate = (clickable.dataset && (clickable.dataset.productId || clickable.dataset.id)) || clickable.id || clickable.name || (clickable.getAttribute && clickable.getAttribute('href'));
  const keyBase = `${pageDataPreview.url}|${pageDataPreview.price || 'null'}|${productIdCandidate || elementText.slice(0,80)}`;
  const productKey = keyBase;

  // If we already processed this product recently, skip
  const lastProcessed = processedProducts.get(productKey);
  if (lastProcessed && (Date.now() - lastProcessed) < CONFIG.PRODUCT_LOCK_MS) return;

  // Prevent multiple simultaneous requests for the same product
  if (processingKeys.has(productKey)) return;
  processingKeys.add(productKey);
  processedProducts.set(productKey, Date.now());

  console.log('[SafeSpend] Purchase intent detected:', elementText.substring(0, 50));

  try {
    // Scrape full page data
    const pageData = pageDataPreview; // already scraped above
    console.log('[SafeSpend] Scraped data:', { 
      url: pageData.url, 
      price: pageData.price,
      textLength: pageData.page_text.length 
    });

    // Send to backend for evaluation
    const result = await evaluatePurchase(pageData);
    console.log('[SafeSpend] Decision:', result);

    // If unauthorized, prompt login
    if (result && typeof result.reason === 'string' && result.reason.toLowerCase().includes('login')) {
      showLoginRequired();
    }

    // Show visual feedback (pass full result so UI actions can be rendered)
    showDecisionFeedback(result);

  } catch (error) {
    console.error('[SafeSpend] Error:', error);
    showDecisionFeedback({ decision: 'WARN', reason: 'Something went wrong - please try again', ui: { type: 'alert', title: 'Error', message: 'Something went wrong - please try again', actions: [{ id:'chat', label:'Chat with Poyo', url: 'https://www.google.com' }, { id:'proceed', label:'Proceed Anyway', action:'proceed' }] } });
  } finally {
    processingKeys.delete(productKey);
  }
}

/**
 * Initialize the content script
 */
function init() {
  console.log('[SafeSpend] Content script loaded on', window.location.hostname);

  // Listen for clicks
  document.addEventListener('click', handleClick, true);

  // Also listen for button/submit events
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    const formText = form.innerText || form.textContent || '';
    if (isPurchaseIntent(formText)) {
      await handleClick({ target: form });
    }
  }, true);
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
