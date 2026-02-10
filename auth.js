/**
 * SafeSpend Authentication Module
 * Handles Supabase Auth for child users
 */

// Hardcoded Supabase credentials (shared instance)
const SUPABASE_CONFIG = {
  URL: 'https://pckmryieldvwbjjrckex.supabase.co', // REPLACE WITH YOUR SUPABASE URL
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBja21yeWllbGR2d2JqanJja2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQ3MjEsImV4cCI6MjA4NjMwMDcyMX0.46aphX7b0qkYshKKyeP9elhgr2Xo2vAJnZmDl9kbX_w' // REPLACE WITH YOUR ANON KEY
};

// Demo account for testing
const DEMO_ACCOUNT = {
  email: 'demo@safespend.app',
  password: 'demo123456',
  userId: '00000000-0000-0000-0000-000000000000'
};

class SafeSpendAuth {
  constructor() {
    this.session = null;
    this.user = null;
    this.supabase = null;
    this.initSupabase();
  }

  /**
   * Initialize Supabase client
   */
  initSupabase() {
    // Load Supabase JS from CDN
    this.supabaseScript = document.createElement('script');
    this.supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js';
    this.supabaseScript.onload = () => {
      this.supabase = window.supabase.createClient(
        SUPABASE_CONFIG.URL,
        SUPABASE_CONFIG.ANON_KEY
      );
      this.loadSession();
    };
    document.head.appendChild(this.supabaseScript);
  }

  /**
   * Load saved session from storage
   */
  async loadSession() {
    const result = await chrome.storage.local.get(['safespend_session', 'safespend_user']);
    if (result.safespend_session && result.safespend_user) {
      this.session = result.safespend_session;
      this.user = result.safespend_user;
      
      // Restore Supabase session
      if (this.supabase) {
        await this.supabase.auth.setSession(this.session);
      }
    }
  }

  /**
   * Save session to storage
   */
  async saveSession(session, user) {
    this.session = session;
    this.user = user;
    await chrome.storage.local.set({
      safespend_session: session,
      safespend_user: user
    });
  }

  /**
   * Clear session (logout)
   */
  async clearSession() {
    this.session = null;
    this.user = null;
    await chrome.storage.local.remove(['safespend_session', 'safespend_user']);
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return !!this.session && !!this.user;
  }

  /**
   * Get current user ID
   */
  getUserId() {
    return this.user?.id || DEMO_ACCOUNT.userId;
  }

  /**
   * Get auth headers for API calls
   */
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.session?.access_token || SUPABASE_CONFIG.ANON_KEY}`,
      'apikey': SUPABASE_CONFIG.ANON_KEY
    };
  }

  /**
   * Login with email/password
   */
  async login(email, password) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

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
      await this.saveSession(demoSession, demoUser);
      return { user: demoUser, session: demoSession };
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await this.saveSession(data.session, data.user);
    return data;
  }

  /**
   * Sign up new account
   */
  async signup(email, password, name) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: 'child'
        }
      }
    });

    if (error) throw error;

    // Create profile in database
    if (data.user) {
      await this.createProfile(data.user.id, name);
      await this.createDefaultRules(data.user.id);
    }

    await this.saveSession(data.session, data.user);
    return data;
  }

  /**
   * Create user profile
   */
  async createProfile(userId, name) {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('profiles')
      .upsert({
        id: userId,
        role: 'child',
        name: name,
        created_at: new Date().toISOString()
      });

    if (error) console.error('Error creating profile:', error);
  }

  /**
   * Create default rules for new user
   */
  async createDefaultRules(userId) {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('rules')
      .upsert({
        child_id: userId,
        weekly_budget: 100,
        strictness_level: 'medium',
        blocked_categories: ['gambling', 'adult'],
        created_at: new Date().toISOString()
      });

    if (error) console.error('Error creating rules:', error);
  }

  /**
   * Check if user has a profile
   */
  async hasProfile(userId) {
    if (!this.supabase) return false;

    const { data, error } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    return !error && !!data;
  }

  /**
   * Logout
   */
  async logout() {
    await this.clearSession();
  }
}

// Create global instance
const safeSpendAuth = new SafeSpendAuth();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SafeSpendAuth, safeSpendAuth, DEMO_ACCOUNT, SUPABASE_CONFIG };
}
