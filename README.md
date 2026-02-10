# SafeSpend Chrome Extension

AI-powered purchase safety system for minors. This Chrome extension detects when users attempt to make online purchases and evaluates them using AI-powered safety rules.

## Features

- **Purchase Detection**: Automatically detects clicks on buy/checkout/pay buttons
- **Smart Scraping**: Extracts URL, price, and page content (without accessing sensitive data)
- **AI Evaluation**: Sends data to Supabase Edge Function for intelligent analysis
- **Visual Feedback**: Shows toast notifications based on decision (APPROVE/WARN/BLOCK)
- **Privacy-First**: Never reads form inputs, passwords, or payment information

## Installation

### 1. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `safespend-extension` folder
5. The extension icon should appear in your toolbar

### 2. Configure Supabase

1. Click the SafeSpend extension icon
2. Enter your Supabase URL (e.g., `https://your-project.supabase.co`)
3. Enter your Supabase Anon Key
4. Click "Save Configuration"

## File Structure

```
safespend-extension/
├── manifest.json      # Extension manifest (v3)
├── content.js         # Content script for page scraping
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── icons/             # Extension icons (create these)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## How It Works

1. **Content Script** (`content.js`) runs on all pages
2. Listens for clicks on elements containing purchase keywords
3. Scrapes page data (URL, price, visible text)
4. Sends data to Supabase Edge Function
5. Receives decision (APPROVE/WARN/BLOCK)
6. Shows visual feedback to user

## Privacy

- ✅ Only reads visible page text
- ✅ Never accesses form inputs
- ✅ Never captures keystrokes
- ✅ Never stores browsing history
- ✅ Never intercepts payment flows

## Development

### Testing

1. Open any e-commerce website
2. Click a "Buy", "Checkout", or "Pay" button
3. Check browser console for scraped data
4. Verify decision appears as toast notification

### Debugging

Enable "Debug Mode" in the extension popup to see detailed logs in the browser console.

## License

MIT
