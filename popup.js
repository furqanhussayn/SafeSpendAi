/**
 * SafeSpend Popup Script
 * Handles authentication and dashboard
 */

// Hardcoded Supabase config (shared instance) — match content script project
const SUPABASE_URL = 'https://pckmryieldvwbjjrckex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBja21yeWllbGR2d2JqanJja2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ3MjEsImV4cCI6MjA4NjMwMDcyMX0.46aphX7b0qkYshKKyeP9elhgr2Xo2vAJnZmDl9kbX_w';

// Demo account
const DEMO_ACCOUNT = {
  email: 'demo@safespend.app',
  password: 'demo123456',
  userId: '00000000-0000-0000-0000-000000000000'
};

// DOM Elements
const elements = {
  // Cards
  loginCard: document.getElementById('login-card'),
  dashboardCard: document.getElementById('dashboard-card'),
  
  // Login form
  loginForm: document.getElementById('login-form'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginMessage: document.getElementById('login-message'),
  
  // Signup form
  // Buttons
  demoLoginBtn: document.getElementById('demo-login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  setupAccountLink: document.getElementById('setup-account-link'),
  
  // Dashboard
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  budgetRemaining: document.getElementById('budget-remaining'),
  budgetSpent: document.getElementById('budget-spent'),
  budgetTotal: document.getElementById('budget-total'),
  budgetProgress: document.getElementById('budget-progress'),
  statApproved: document.getElementById('stat-approved'),
  statWarned: document.getElementById('stat-warned'),
  statBlocked: document.getElementById('stat-blocked')
};

let supabase = null;

/**
 * Initialize Supabase client
 */
function initSupabase() {
  // Check if Supabase is loaded
  if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    checkAuthStatus();
  } else {
    // Load Supabase script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js';
    script.onload = () => {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      checkAuthStatus();
    };
    document.head.appendChild(script);
  }
}

/**
 * Check if user is already logged in
 */
async function checkAuthStatus() {
  const result = await chrome.storage.local.get(['safespend_session', 'safespend_user']);
  
  if (result.safespend_session && result.safespend_user) {
    // Restore session in Supabase
    await supabase.auth.setSession(result.safespend_session);
    showDashboard(result.safespend_user);
  } else {
    showLogin();
  }
}

/**
 * Show login card
 */
function showLogin() {
  elements.loginCard.classList.remove('hidden');
  elements.dashboardCard.classList.add('hidden');
}

/**
 * Show signup card
 */
/**
 * Show dashboard
 */
async function showDashboard(user) {
  elements.loginCard.classList.add('hidden');
  elements.dashboardCard.classList.remove('hidden');
  
  // Update user info
  const name = user.user_metadata?.name || user.email.split('@')[0];
  elements.userName.textContent = name;
  elements.userEmail.textContent = user.email;
  elements.userAvatar.textContent = name.charAt(0).toUpperCase();
  
  // Load dashboard data
  await loadDashboardData(user.id);
}

/**
 * Load dashboard data from Supabase
 */
async function loadDashboardData(userId) {
  try {
    // Get user's rules
    const { data: rules, error: rulesError } = await supabase
      .from('rules')
      .select('*')
      .eq('child_id', userId)
      .single();
    
    if (rulesError) {
      console.log('No rules found, using defaults');
    }
    
    const weeklyBudget = rules?.weekly_budget || 100;
    
    // Get this week's transactions
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('*')
      .eq('child_id', userId)
      .gte('created_at', oneWeekAgo.toISOString());
    
    if (transError) {
      console.error('Error loading transactions:', transError);
    }
    
    // Calculate stats
    const approved = transactions?.filter(t => t.decision === 'APPROVE') || [];
    const warned = transactions?.filter(t => t.decision === 'WARN') || [];
    const blocked = transactions?.filter(t => t.decision === 'BLOCK') || [];
    
    const spentThisWeek = approved.reduce((sum, t) => sum + (t.price || 0), 0);
    const remaining = Math.max(0, weeklyBudget - spentThisWeek);
    const percentUsed = Math.min(100, (spentThisWeek / weeklyBudget) * 100);
    
    // Update UI
    elements.budgetRemaining.textContent = `$${remaining.toFixed(0)}`;
    elements.budgetSpent.textContent = `$${spentThisWeek.toFixed(0)} spent`;
    elements.budgetTotal.textContent = `of $${weeklyBudget}`;
    elements.budgetProgress.style.width = `${percentUsed}%`;
    
    // Color code progress bar
    if (percentUsed > 90) {
      elements.budgetProgress.style.background = '#ef4444';
    } else if (percentUsed > 70) {
      elements.budgetProgress.style.background = '#f59e0b';
    } else {
      elements.budgetProgress.style.background = 'white';
    }
    
    elements.statApproved.textContent = approved.length;
    elements.statWarned.textContent = warned.length;
    elements.statBlocked.textContent = blocked.length;
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

/**
 * Show message
 */
function showMessage(element, text, type) {
  element.innerHTML = `<div class="message ${type}">${text}</div>`;
  setTimeout(() => {
    element.innerHTML = '';
  }, 5000);
}

/**
 * Handle login
 */
async function handleLogin(e) {
  e.preventDefault();
  
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  
  if (!email || !password) {
    showMessage(elements.loginMessage, 'Please enter email and password', 'error');
    return;
  }
  
  try {
    // Demo account shortcut
    if (email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
      const demoUser = {
        id: DEMO_ACCOUNT.userId,
        email: DEMO_ACCOUNT.email,
        user_metadata: { name: 'Demo Child' }
      };
      const demoSession = {
        access_token: 'demo_token',
        refresh_token: 'demo_refresh'
      };
      
      await chrome.storage.local.set({
        safespend_session: demoSession,
        safespend_user: demoUser
      });
      
      showDashboard(demoUser);
      return;
    }
    
    // Real Supabase login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Save session
    await chrome.storage.local.set({
      safespend_session: data.session,
      safespend_user: data.user
    });
    
    showDashboard(data.user);
    
  } catch (error) {
    console.error('Login error:', error);
    showMessage(elements.loginMessage, error.message || 'Login failed', 'error');
  }
}

/**
 * Handle demo login
 */
async function handleDemoLogin() {
  elements.loginEmail.value = DEMO_ACCOUNT.email;
  elements.loginPassword.value = DEMO_ACCOUNT.password;
  // Set a persistent demo session and user so stats persist across popup opens
  const demoUser = {
    id: DEMO_ACCOUNT.userId,
    email: DEMO_ACCOUNT.email,
    user_metadata: { name: 'Demo Child' }
  };
  const demoSession = { access_token: 'demo_token', refresh_token: 'demo_refresh' };
  await chrome.storage.local.set({ safespend_session: demoSession, safespend_user: demoUser });
  if (supabase && supabase.auth && supabase.auth.setSession) {
    await supabase.auth.setSession(demoSession).catch(() => {});
  }
  showDashboard(demoUser);
}

/**
 * Handle signup
 */
async function handleSignup(e) {
  e.preventDefault();
  
  const name = elements.signupName.value.trim();
  const email = elements.signupEmail.value.trim();
  const password = elements.signupPassword.value;
  
  if (!name || !email || !password) {
    showMessage(elements.signupMessage, 'Please fill in all fields', 'error');
    return;
  }
  
  if (password.length < 6) {
    showMessage(elements.signupMessage, 'Password must be at least 6 characters', 'error');
    return;
  }
  
  try {
    // Sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: 'child' }
      }
    });
    
    if (error) throw error;
    
    // Create profile
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        role: 'child',
        name: name,
        created_at: new Date().toISOString()
      });
      
      // Create default rules
      await supabase.from('rules').insert({
        child_id: data.user.id,
        weekly_budget: 100,
        strictness_level: 'medium',
        blocked_categories: ['gambling', 'adult'],
        created_at: new Date().toISOString()
      });
    }
    
    // Save session
    await chrome.storage.local.set({
      safespend_session: data.session,
      safespend_user: data.user
    });
    
    showMessage(elements.signupMessage, 'Account created successfully!', 'success');
    
    setTimeout(() => {
      showDashboard(data.user);
    }, 1000);
    
  } catch (error) {
    console.error('Signup error:', error);
    showMessage(elements.signupMessage, error.message || 'Signup failed', 'error');
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  await chrome.storage.local.remove(['safespend_session', 'safespend_user']);
  await supabase.auth.signOut();
  
  // Clear form
  elements.loginEmail.value = '';
  elements.loginPassword.value = '';
  
  showLogin();
}

/**
 * Open setup page
 */
function openSetupPage() {
  chrome.tabs.create({
    url: 'https://safespend.app/setup' // Replace with your actual setup page
  });
}

// Event Listeners
elements.loginForm.addEventListener('submit', handleLogin);
elements.demoLoginBtn.addEventListener('click', handleDemoLogin);
elements.logoutBtn.addEventListener('click', handleLogout);
elements.setupAccountLink.addEventListener('click', (e) => {
  e.preventDefault();
  // Open parent-facing help page in new tab
  chrome.tabs.create({ url: elements.setupAccountLink.href });
});

// Initialize
document.addEventListener('DOMContentLoaded', initSupabase);
