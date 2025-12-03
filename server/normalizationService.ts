// Vendor normalization and category classification service
import { callAIWithFallback, callAI, getAvailableProviders } from "./aiService";

interface NormalizedVendor {
  cleanName: string;
  confidence: number;
  method: 'ai' | 'rules' | 'fallback';
}

interface ClassifiedCategory {
  category: string;
  confidence: number;
  reasoning?: string;
  method: 'ai' | 'rules' | 'fallback';
}

// Comprehensive vendor name mappings for rule-based normalization
const VENDOR_MAPPINGS: Record<string, string> = {
  // Cloud & Infrastructure
  'amzn': 'Amazon',
  'amazon': 'Amazon',
  'aws': 'Amazon Web Services',
  'google': 'Google',
  'gcp': 'Google Cloud',
  'azure': 'Microsoft Azure',
  'msft': 'Microsoft',
  'microsoft': 'Microsoft',
  'digitalocean': 'DigitalOcean',
  'linode': 'Linode',
  'heroku': 'Heroku',
  'vercel': 'Vercel',
  'netlify': 'Netlify',
  'cloudflare': 'Cloudflare',
  'fastly': 'Fastly',
  
  // SaaS & Software
  'slack': 'Slack',
  'notion': 'Notion',
  'figma': 'Figma',
  'canva': 'Canva',
  'zoom': 'Zoom',
  'salesforce': 'Salesforce',
  'hubspot': 'HubSpot',
  'zendesk': 'Zendesk',
  'intercom': 'Intercom',
  'mailchimp': 'Mailchimp',
  'sendgrid': 'SendGrid',
  'twilio': 'Twilio',
  'stripe': 'Stripe',
  'braintree': 'Braintree',
  'plaid': 'Plaid',
  'docusign': 'DocuSign',
  'dropbox': 'Dropbox',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'atlassian': 'Atlassian',
  'jira': 'Jira',
  'confluence': 'Confluence',
  'bitbucket': 'Bitbucket',
  'asana': 'Asana',
  'monday': 'Monday.com',
  'trello': 'Trello',
  'airtable': 'Airtable',
  'linear': 'Linear',
  'datadog': 'Datadog',
  'newrelic': 'New Relic',
  'sentry': 'Sentry',
  'pagerduty': 'PagerDuty',
  'segment': 'Segment',
  'mixpanel': 'Mixpanel',
  'amplitude': 'Amplitude',
  'fullstory': 'FullStory',
  'hotjar': 'Hotjar',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  
  // Payroll & HR
  'gusto': 'Gusto',
  'adp': 'ADP',
  'paychex': 'Paychex',
  'rippling': 'Rippling',
  'justworks': 'Justworks',
  'deel': 'Deel',
  'remote': 'Remote.com',
  'paylocity': 'Paylocity',
  'bamboohr': 'BambooHR',
  'zenefits': 'Zenefits',
  'lattice': 'Lattice',
  
  // Payments & Finance
  'sq': 'Square',
  'square': 'Square',
  'paypal': 'PayPal',
  'venmo': 'Venmo',
  'bill.com': 'Bill.com',
  'ramp': 'Ramp',
  'brex': 'Brex',
  'mercury': 'Mercury',
  'wise': 'Wise',
  'quickbooks': 'QuickBooks',
  'intuit': 'Intuit',
  'xero': 'Xero',
  'freshbooks': 'FreshBooks',
  
  // Marketing & Advertising
  'facebook': 'Meta',
  'meta': 'Meta',
  'instagram': 'Instagram',
  'twitter': 'X (Twitter)',
  'linkedin': 'LinkedIn',
  'tiktok': 'TikTok',
  'snapchat': 'Snapchat',
  'reddit': 'Reddit',
  'pinterest': 'Pinterest',
  
  // Office & Productivity
  'wework': 'WeWork',
  'regus': 'Regus',
  'industrious': 'Industrious',
  'staples': 'Staples',
  'officedepot': 'Office Depot',
  'apple': 'Apple',
  'dell': 'Dell',
  'lenovo': 'Lenovo',
  'hp': 'HP',
  
  // Travel & Transportation
  'uber': 'Uber',
  'lyft': 'Lyft',
  'delta': 'Delta Airlines',
  'united': 'United Airlines',
  'american': 'American Airlines',
  'southwest': 'Southwest Airlines',
  'marriott': 'Marriott',
  'hilton': 'Hilton',
  'airbnb': 'Airbnb',
  'expedia': 'Expedia',
};

export class NormalizationService {
  /**
   * Normalize a raw vendor name using rules first, then AI as fallback
   * Cleans up transaction descriptions like "AMZN MKTP US*2J3K4L" -> "Amazon"
   */
  async normalizeVendorName(rawDescription: string): Promise<NormalizedVendor> {
    // First, try rule-based normalization for known vendors
    const ruleBasedResult = this.ruleBasedNormalize(rawDescription);
    if (ruleBasedResult) {
      return {
        cleanName: ruleBasedResult,
        confidence: 0.95, // High confidence for known vendors
        method: 'rules',
      };
    }
    
    // Try AI normalization with fallback between providers
    const prompt = `Extract the clean vendor/merchant name from this transaction description. Return ONLY the business name, no other text.

Transaction description: "${rawDescription}"

Rules:
- Remove transaction IDs, reference numbers, locations
- Expand common abbreviations (AMZN -> Amazon, SQ -> Square, etc.)
- Return the canonical business name
- If it's a person/individual, keep the name as-is
- If unclear, return the closest recognizable business name

Examples:
"AMZN MKTP US*2J3K4L" -> "Amazon"
"SQ *COFFEE SHOP NYC" -> "Square - Coffee Shop"
"GOOGLE*Google Storage" -> "Google Cloud"
"STRIPE PAYMENT" -> "Stripe"
"PAYPAL *SHOPIFY" -> "Shopify"
"ACH TRANSFER - John Smith" -> "John Smith"

Clean vendor name:`;

    try {
      const result = await callAIWithFallback({
        prompt,
        maxTokens: 50,
        temperature: 0.1, // Low temperature for consistency
        retryCount: 2,
      });

      const cleanName = result.content.trim();
      
      // Validate AI response
      if (!this.isValidVendorName(cleanName)) {
        console.warn(`[normalization] AI returned invalid vendor name: "${cleanName}"`);
        return {
          cleanName: this.simpleNormalize(rawDescription),
          confidence: 0.4,
          method: 'fallback',
        };
      }
      
      // High confidence if we got a clean response
      const confidence = cleanName.length > 0 && cleanName.length < 100 ? 0.85 : 0.5;

      return {
        cleanName: cleanName || rawDescription,
        confidence,
        method: 'ai',
      };
    } catch (error) {
      console.error("Vendor normalization error:", error);
      // Fallback: simple cleanup
      return {
        cleanName: this.simpleNormalize(rawDescription),
        confidence: 0.3,
        method: 'fallback',
      };
    }
  }

  /**
   * Rule-based vendor normalization using known vendor mappings
   */
  private ruleBasedNormalize(raw: string): string | null {
    const lowerRaw = raw.toLowerCase();
    
    // Check each known vendor pattern
    for (const [pattern, normalizedName] of Object.entries(VENDOR_MAPPINGS)) {
      // Match if the pattern appears anywhere in the description
      if (lowerRaw.includes(pattern)) {
        return normalizedName;
      }
    }
    
    return null;
  }

  /**
   * Validate that AI returned a reasonable vendor name
   */
  private isValidVendorName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    if (name.length === 0 || name.length > 100) return false;
    
    // Reject if it looks like an error message or explanation
    const badPatterns = [
      'sorry', 'cannot', 'unable', 'error', 'invalid',
      'i don\'t', 'i do not', 'unclear', 'unknown',
    ];
    const lowerName = name.toLowerCase();
    if (badPatterns.some((p) => lowerName.includes(p))) return false;
    
    // Reject if it's too long to be a vendor name
    if (name.split(' ').length > 10) return false;
    
    return true;
  }

  /**
   * Simple fallback normalization without AI
   */
  private simpleNormalize(raw: string): string {
    // Remove common prefixes
    let clean = raw
      .replace(/^(DEBIT CARD|CREDIT CARD|ACH|WIRE|CHECK|ATM|POS|PURCHASE)\s*/gi, "")
      .replace(/^(RECURRING|AUTO PAY|AUTOPAY|BILL PAY)\s*/gi, "")
      .replace(/\*[A-Z0-9]+$/gi, "") // Remove trailing transaction IDs
      .replace(/\*\d+/g, "") // Remove asterisk + numbers
      .replace(/#\d+/g, "") // Remove hash + numbers
      .replace(/\s+\d{4,}/g, "") // Remove long number sequences
      .replace(/\s+/g, " ")
      .trim();

    // Capitalize first letter of each word
    clean = clean
      .split(" ")
      .map((word) => {
        if (word.length <= 2) return word.toUpperCase(); // Keep short abbreviations uppercase
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");

    return clean || raw;
  }

  /**
   * Classify a transaction into a spending category using rules first, then AI
   */
  async classifyCategory(
    vendorName: string,
    description: string,
    amount: number
  ): Promise<ClassifiedCategory> {
    // Valid categories
    const validCategories = [
      "Software & SaaS",
      "Marketing & Advertising",
      "Payroll & Benefits",
      "Office & Equipment",
      "Professional Services",
      "Travel & Meals",
      "Operations & Misc",
    ];

    // First, try rule-based classification for high confidence results
    const ruleCategory = this.ruleBasedCategory(vendorName, description);
    const ruleConfidence = this.getRuleCategoryConfidence(vendorName, description);
    
    // If rule-based has high confidence (known vendor), use it
    if (ruleConfidence >= 0.8) {
      return {
        category: ruleCategory,
        confidence: ruleConfidence,
        method: 'rules',
      };
    }

    // Try AI classification with fallback
    const prompt = `Classify this business transaction into ONE spending category.

Vendor: ${vendorName}
Description: ${description}
Amount: $${Math.abs(amount).toFixed(2)}

Categories to choose from:
- Software & SaaS (cloud services, software subscriptions, APIs, dev tools)
- Marketing & Advertising (ads, SEO, content, email marketing)
- Payroll & Benefits (salaries, health insurance, 401k, taxes)
- Office & Equipment (rent, utilities, furniture, computers)
- Professional Services (legal, accounting, consulting)
- Travel & Meals (flights, hotels, restaurants, transportation)
- Operations & Misc (other business expenses)

Return ONLY the category name exactly as shown above, nothing else.

Category:`;

    try {
      const result = await callAIWithFallback({
        prompt,
        maxTokens: 30,
        temperature: 0.2,
        retryCount: 2,
      });

      const category = result.content.trim();
      
      // Exact match
      if (validCategories.includes(category)) {
        return {
          category,
          confidence: 0.85,
          method: 'ai',
        };
      }

      // Fuzzy match
      const matched = validCategories.find((vc) =>
        category.toLowerCase().includes(vc.toLowerCase().split(" ")[0])
      );

      if (matched) {
        return {
          category: matched,
          confidence: 0.7,
          method: 'ai',
        };
      }

      // AI didn't return a valid category, fall back to rules
      return {
        category: ruleCategory,
        confidence: Math.max(0.5, ruleConfidence),
        method: 'fallback',
      };
    } catch (error) {
      console.error("Category classification error:", error);
      // Fallback to rule-based
      return {
        category: ruleCategory,
        confidence: Math.max(0.5, ruleConfidence),
        method: 'fallback',
      };
    }
  }

  /**
   * Comprehensive rule-based category classification
   */
  private ruleBasedCategory(vendor: string, description: string): string {
    const text = `${vendor} ${description}`.toLowerCase();

    // Software & SaaS patterns
    const softwarePatterns = [
      'aws', 'amazon web services', 'google cloud', 'gcp', 'azure', 'microsoft azure',
      'github', 'gitlab', 'bitbucket', 'vercel', 'netlify', 'heroku', 'digitalocean',
      'stripe', 'plaid', 'twilio', 'sendgrid', 'mailchimp', 'slack', 'notion',
      'figma', 'canva', 'zoom', 'webex', 'teams', 'dropbox', 'box', 'google drive',
      'salesforce', 'hubspot', 'zendesk', 'intercom', 'freshdesk', 'jira', 'confluence',
      'asana', 'monday', 'trello', 'linear', 'clickup', 'airtable', 'coda',
      'datadog', 'newrelic', 'sentry', 'pagerduty', 'cloudflare', 'fastly',
      'openai', 'anthropic', 'segment', 'mixpanel', 'amplitude', 'fullstory', 'hotjar',
      'saas', 'subscription', 'software', 'api', 'cloud', 'hosting', 'domain',
    ];
    if (softwarePatterns.some((p) => text.includes(p))) {
      return "Software & SaaS";
    }

    // Marketing & Advertising patterns
    const marketingPatterns = [
      'google ads', 'facebook ads', 'meta ads', 'instagram ads', 'linkedin ads',
      'twitter ads', 'tiktok ads', 'snapchat ads', 'pinterest ads', 'reddit ads',
      'adwords', 'bing ads', 'yahoo ads', 'display ads', 'programmatic',
      'marketing', 'advertising', 'ads', 'campaign', 'pr agency', 'media buy',
      'seo', 'sem', 'content', 'branding', 'creative agency', 'influencer',
      'mailchimp', 'constant contact', 'klaviyo', 'hubspot marketing',
    ];
    if (marketingPatterns.some((p) => text.includes(p))) {
      return "Marketing & Advertising";
    }

    // Payroll & Benefits patterns
    const payrollPatterns = [
      'payroll', 'salary', 'wage', 'gusto', 'adp', 'paychex', 'rippling',
      'justworks', 'deel', 'remote.com', 'paylocity', 'bamboohr', 'zenefits',
      'lattice', '401k', 'health insurance', 'dental', 'vision', 'hsa', 'fsa',
      'workers comp', 'unemployment', 'tax deposit', 'eftps', 'benefits',
      'bonus', 'commission', 'severance', 'pto payout',
    ];
    if (payrollPatterns.some((p) => text.includes(p))) {
      return "Payroll & Benefits";
    }

    // Office & Equipment patterns
    const officePatterns = [
      'rent', 'lease', 'office', 'wework', 'regus', 'industrious', 'coworking',
      'utilities', 'electric', 'gas', 'water', 'internet', 'phone', 'comcast', 'verizon',
      'furniture', 'desk', 'chair', 'equipment', 'computer', 'laptop', 'monitor',
      'apple', 'dell', 'lenovo', 'hp', 'logitech', 'staples', 'office depot',
      'amazon business', 'supplies', 'printer', 'scanner', 'phone system',
    ];
    if (officePatterns.some((p) => text.includes(p))) {
      return "Office & Equipment";
    }

    // Professional Services patterns
    const professionalPatterns = [
      'legal', 'law firm', 'attorney', 'lawyer', 'llp', 'counsel',
      'accounting', 'accountant', 'cpa', 'bookkeeping', 'audit', 'tax prep',
      'consulting', 'consultant', 'advisor', 'advisory', 'coach', 'mentor',
      'insurance', 'liability', 'd&o', 'e&o', 'professional liability',
      'recruiting', 'staffing', 'headhunter', 'contractor', 'freelancer',
    ];
    if (professionalPatterns.some((p) => text.includes(p))) {
      return "Professional Services";
    }

    // Travel & Meals patterns
    const travelPatterns = [
      'hotel', 'marriott', 'hilton', 'hyatt', 'airbnb', 'vrbo', 'lodging',
      'flight', 'airline', 'delta', 'united', 'american', 'southwest', 'jetblue',
      'uber', 'lyft', 'taxi', 'rental car', 'hertz', 'enterprise', 'avis',
      'restaurant', 'cafe', 'coffee', 'dining', 'catering', 'doordash', 'grubhub',
      'uber eats', 'postmates', 'seamless', 'meal', 'lunch', 'dinner', 'breakfast',
      'expedia', 'booking.com', 'kayak', 'travel', 'trip', 'transportation',
    ];
    if (travelPatterns.some((p) => text.includes(p))) {
      return "Travel & Meals";
    }

    return "Operations & Misc";
  }

  /**
   * Get confidence score for rule-based category classification
   * Higher confidence for specific vendor matches, lower for general patterns
   */
  private getRuleCategoryConfidence(vendor: string, description: string): number {
    const text = `${vendor} ${description}`.toLowerCase();
    
    // Specific known vendors get high confidence
    const highConfidenceVendors = [
      'gusto', 'adp', 'paychex', 'rippling', // Payroll
      'aws', 'google cloud', 'azure', 'stripe', 'github', 'vercel', // Software
      'wework', 'regus', // Office
      'uber', 'lyft', 'delta', 'united', 'marriott', 'hilton', // Travel
      'google ads', 'facebook ads', 'linkedin ads', // Marketing
    ];
    
    if (highConfidenceVendors.some((v) => text.includes(v))) {
      return 0.9;
    }
    
    // Medium confidence for general patterns
    const mediumConfidencePatterns = [
      'payroll', 'salary', 'rent', 'office', 'legal', 'accounting',
      'hotel', 'flight', 'restaurant', 'software', 'subscription',
    ];
    
    if (mediumConfidencePatterns.some((p) => text.includes(p))) {
      return 0.75;
    }
    
    // Low confidence for fallback to Operations & Misc
    return 0.5;
  }

  /**
   * Detect if a vendor is likely a subscription (recurring charge)
   */
  isLikelySubscription(vendorName: string): boolean {
    const subscriptionKeywords = [
      "subscription",
      "monthly",
      "netflix",
      "spotify",
      "adobe",
      "microsoft",
      "google workspace",
      "github",
      "aws",
      "vercel",
      "saas",
    ];

    const lowerVendor = vendorName.toLowerCase();
    return subscriptionKeywords.some((keyword) => lowerVendor.includes(keyword));
  }
}

export const normalizationService = new NormalizationService();
