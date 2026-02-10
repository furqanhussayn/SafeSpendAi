/**
 * SafeSpend Background Service Worker
 * Handles session management and cross-context communication
 */

// Hardcoded Supabase config
const SUPABASE_URL = 'https://pckmryieldvwbjjrckex.supabase.co'; // REPLACE WITH YOUR URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBja21yeWllbGR2d2JqanJja2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ3MjEsImV4cCI6MjA4NjMwMDcyMX0.46aphX7b0qkYshKKyeP9elhgr2Xo2vAJnZmDl9kbX_w'; // REPLACE WITH YOUR ANON KEY

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SafeSpend] Extension installed:', details.reason);
  
  // Set default values
  chrome.storage.local.set({
    safespend_installed: true,
    install_date: new Date().toISOString()
  });
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
  }
  
  if (request.action === 'getSession') {
    chrome.storage.local.get(['safespend_session', 'safespend_user'])
      .then(result => {
        sendResponse({ 
          session: result.safespend_session, 
          user: result.safespend_user 
        });
      });
    return true; // Keep channel open for async
  }
  
  if (request.action === 'setSession') {
    chrome.storage.local.set({
      safespend_session: request.session,
      safespend_user: request.user
    }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'clearSession') {
    chrome.storage.local.remove(['safespend_session', 'safespend_user'])
      .then(() => {
        sendResponse({ success: true });
      });
    return true;
  }
  
  if (request.action === 'checkAuth') {
    chrome.storage.local.get(['safespend_session'])
      .then(result => {
        sendResponse({ 
          isLoggedIn: !!result.safespend_session 
        });
      });
    return true;
  }
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener((tab) => {
  // The popup will open automatically, this is just for logging
  console.log('[SafeSpend] Extension icon clicked');
});

console.log('[SafeSpend] Background service worker started');
