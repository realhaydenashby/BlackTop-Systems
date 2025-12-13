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

// CAC spend classification for unit economics
export type CACSpendType = 
  | 'marketing_paid_ads'      // Google Ads, Meta Ads, LinkedIn Ads, etc.
  | 'marketing_content'       // Content agencies, freelance writers, SEO
  | 'marketing_tools'         // Marketing automation, email platforms
  | 'marketing_events'        // Conferences, sponsorships, trade shows
  | 'marketing_other'         // Other marketing spend
  | 'sales_tools'             // CRM, sales automation, prospecting tools
  | 'sales_commissions'       // Sales rep commissions, bonuses
  | 'sales_travel'            // Sales travel, client entertainment
  | 'sales_other'             // Other sales spend
  | 'not_cac';                // Not customer acquisition spend

export interface CACClassification {
  spendType: CACSpendType;
  isCACSpend: boolean;
  category: 'marketing' | 'sales' | 'none';
  subcategory: string;
  confidence: number;
  reasoning?: string;
  method: 'ai' | 'rules' | 'fallback';
  requiresReview: boolean; // True if confidence < 0.8
}

// Known CAC vendor mappings for high-confidence rule-based classification
const CAC_VENDOR_MAPPINGS: Record<string, { type: CACSpendType; confidence: number }> = {
  // Paid Advertising Platforms
  'google ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'facebook ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'meta ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'linkedin ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'twitter ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'tiktok ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'bing ads': { type: 'marketing_paid_ads', confidence: 0.98 },
  'reddit ads': { type: 'marketing_paid_ads', confidence: 0.95 },
  'pinterest ads': { type: 'marketing_paid_ads', confidence: 0.95 },
  'snapchat ads': { type: 'marketing_paid_ads', confidence: 0.95 },
  'adroll': { type: 'marketing_paid_ads', confidence: 0.95 },
  'taboola': { type: 'marketing_paid_ads', confidence: 0.95 },
  'outbrain': { type: 'marketing_paid_ads', confidence: 0.95 },
  'criteo': { type: 'marketing_paid_ads', confidence: 0.95 },
  
  // Marketing Tools & Platforms
  'hubspot': { type: 'marketing_tools', confidence: 0.9 },
  'mailchimp': { type: 'marketing_tools', confidence: 0.95 },
  'klaviyo': { type: 'marketing_tools', confidence: 0.95 },
  'constant contact': { type: 'marketing_tools', confidence: 0.95 },
  'sendgrid': { type: 'marketing_tools', confidence: 0.9 },
  'marketo': { type: 'marketing_tools', confidence: 0.95 },
  'pardot': { type: 'marketing_tools', confidence: 0.95 },
  'activecampaign': { type: 'marketing_tools', confidence: 0.95 },
  'convertkit': { type: 'marketing_tools', confidence: 0.95 },
  'drip': { type: 'marketing_tools', confidence: 0.95 },
  'buffer': { type: 'marketing_tools', confidence: 0.9 },
  'hootsuite': { type: 'marketing_tools', confidence: 0.9 },
  'sprout social': { type: 'marketing_tools', confidence: 0.9 },
  'later': { type: 'marketing_tools', confidence: 0.9 },
  'canva': { type: 'marketing_tools', confidence: 0.85 },
  
  // SEO & Content Tools
  'ahrefs': { type: 'marketing_content', confidence: 0.95 },
  'semrush': { type: 'marketing_content', confidence: 0.95 },
  'moz': { type: 'marketing_content', confidence: 0.95 },
  'surfer seo': { type: 'marketing_content', confidence: 0.95 },
  'clearscope': { type: 'marketing_content', confidence: 0.95 },
  'jasper': { type: 'marketing_content', confidence: 0.9 },
  'copy.ai': { type: 'marketing_content', confidence: 0.9 },
  'grammarly': { type: 'marketing_content', confidence: 0.8 },
  
  // Sales Tools & CRMs
  'salesforce': { type: 'sales_tools', confidence: 0.95 },
  'pipedrive': { type: 'sales_tools', confidence: 0.95 },
  'close': { type: 'sales_tools', confidence: 0.9 },
  'outreach': { type: 'sales_tools', confidence: 0.95 },
  'salesloft': { type: 'sales_tools', confidence: 0.95 },
  'apollo': { type: 'sales_tools', confidence: 0.95 },
  'zoominfo': { type: 'sales_tools', confidence: 0.95 },
  'linkedin sales': { type: 'sales_tools', confidence: 0.95 },
  'gong': { type: 'sales_tools', confidence: 0.95 },
  'chorus': { type: 'sales_tools', confidence: 0.95 },
  'drift': { type: 'sales_tools', confidence: 0.9 },
  'intercom': { type: 'sales_tools', confidence: 0.85 },
  'zendesk': { type: 'sales_tools', confidence: 0.8 },
  'calendly': { type: 'sales_tools', confidence: 0.85 },
  'docusign': { type: 'sales_tools', confidence: 0.85 },
  'pandadoc': { type: 'sales_tools', confidence: 0.9 },
  'proposify': { type: 'sales_tools', confidence: 0.9 },
  'clearbit': { type: 'sales_tools', confidence: 0.95 },
  'leadfeeder': { type: 'sales_tools', confidence: 0.95 },
  
  // Events & Conferences
  'eventbrite': { type: 'marketing_events', confidence: 0.85 },
  'hopin': { type: 'marketing_events', confidence: 0.85 },
  'bizzabo': { type: 'marketing_events', confidence: 0.9 },
};

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

// Guard to prevent repeated ML vendor error logging
let mlVendorErrorLogged = false;

export class NormalizationService {
  /**
   * Normalize a raw vendor name using rules first, then ML, then AI as fallback
   * Cleans up transaction descriptions like "AMZN MKTP US*2J3K4L" -> "Amazon"
   */
  async normalizeVendorName(rawDescription: string, organizationId?: string): Promise<NormalizedVendor> {
    // First, try rule-based normalization for known vendors
    const ruleBasedResult = this.ruleBasedNormalize(rawDescription);
    if (ruleBasedResult) {
      return {
        cleanName: ruleBasedResult,
        confidence: 0.95, // High confidence for known vendors
        method: 'rules',
      };
    }
    
    // Second, try local ML model if organizationId is provided
    if (organizationId) {
      try {
        const { normalizeVendorLocal } = await import("./ml/vendorEmbeddings");
        const mlResult = await normalizeVendorLocal(organizationId, rawDescription);
        if (mlResult) {
          console.log(`[normalization] ML normalized "${rawDescription}" -> "${mlResult.normalizedName}" (${(mlResult.confidence * 100).toFixed(1)}%)`);
          return {
            cleanName: mlResult.normalizedName,
            confidence: mlResult.confidence,
            method: 'rules', // Report as rules for compatibility
          };
        }
      } catch (error: any) {
        if (!mlVendorErrorLogged) {
          console.warn(`[normalization] ML vendor model unavailable:`, error.message || error);
          mlVendorErrorLogged = true;
        }
      }
    }
    
    // Third, try AI normalization with fallback between providers
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

  /**
   * Classify a transaction for CAC (Customer Acquisition Cost) calculation
   * Returns detailed classification of marketing vs sales spend with subcategories
   * Used for unit economics calculation in SaaS metrics
   */
  async classifyCACSpend(
    vendorName: string,
    description: string,
    amount: number
  ): Promise<CACClassification> {
    const text = `${vendorName} ${description}`.toLowerCase();
    
    // First, try rule-based classification using known CAC vendors
    for (const [pattern, config] of Object.entries(CAC_VENDOR_MAPPINGS)) {
      if (text.includes(pattern)) {
        const category = config.type.startsWith('marketing') ? 'marketing' : 'sales';
        const subcategory = this.getSubcategoryLabel(config.type);
        
        return {
          spendType: config.type,
          isCACSpend: true,
          category,
          subcategory,
          confidence: config.confidence,
          method: 'rules',
          requiresReview: config.confidence < 0.8,
        };
      }
    }
    
    // Check for pattern-based CAC classification
    const patternResult = this.patternBasedCACClassification(text, amount);
    if (patternResult && patternResult.confidence >= 0.7) {
      return {
        ...patternResult,
        method: 'rules',
        requiresReview: patternResult.confidence < 0.8,
      };
    }
    
    // Use AI for uncertain cases
    const aiResult = await this.aiClassifyCACSpend(vendorName, description, amount);
    return aiResult;
  }

  /**
   * Pattern-based CAC classification for common spend patterns
   */
  private patternBasedCACClassification(
    text: string,
    amount: number
  ): Omit<CACClassification, 'method' | 'requiresReview'> | null {
    // Paid advertising patterns
    const paidAdsPatterns = [
      'advertising', 'ad spend', 'ppc', 'cpc', 'cpm', 'display ads',
      'search ads', 'social ads', 'retargeting', 'remarketing',
      'sponsored', 'promotion', 'boost', 'paid media',
    ];
    if (paidAdsPatterns.some(p => text.includes(p))) {
      return {
        spendType: 'marketing_paid_ads',
        isCACSpend: true,
        category: 'marketing',
        subcategory: 'Paid Advertising',
        confidence: 0.85,
      };
    }
    
    // Content & SEO patterns
    const contentPatterns = [
      'content', 'seo', 'copywriting', 'blog', 'article', 'writer',
      'video production', 'podcast', 'webinar', 'ebook', 'whitepaper',
      'infographic', 'creative agency', 'design agency',
    ];
    if (contentPatterns.some(p => text.includes(p))) {
      return {
        spendType: 'marketing_content',
        isCACSpend: true,
        category: 'marketing',
        subcategory: 'Content & SEO',
        confidence: 0.75,
      };
    }
    
    // Events patterns
    const eventPatterns = [
      'conference', 'trade show', 'expo', 'summit', 'sponsorship',
      'event', 'booth', 'exhibition', 'networking', 'meetup',
    ];
    if (eventPatterns.some(p => text.includes(p))) {
      return {
        spendType: 'marketing_events',
        isCACSpend: true,
        category: 'marketing',
        subcategory: 'Events & Conferences',
        confidence: 0.75,
      };
    }
    
    // Sales commission patterns (often larger amounts)
    const commissionPatterns = [
      'commission', 'bonus', 'spiff', 'incentive', 'sales payout',
    ];
    if (commissionPatterns.some(p => text.includes(p)) && amount > 500) {
      return {
        spendType: 'sales_commissions',
        isCACSpend: true,
        category: 'sales',
        subcategory: 'Sales Commissions',
        confidence: 0.8,
      };
    }
    
    // Sales travel patterns
    const salesTravelPatterns = [
      'client dinner', 'prospect meeting', 'sales trip', 'client lunch',
      'business development', 'bd trip',
    ];
    if (salesTravelPatterns.some(p => text.includes(p))) {
      return {
        spendType: 'sales_travel',
        isCACSpend: true,
        category: 'sales',
        subcategory: 'Sales Travel & Entertainment',
        confidence: 0.7,
      };
    }
    
    return null;
  }

  /**
   * AI-powered CAC spend classification for uncertain transactions
   */
  private async aiClassifyCACSpend(
    vendorName: string,
    description: string,
    amount: number
  ): Promise<CACClassification> {
    const prompt = `Classify this business transaction for Customer Acquisition Cost (CAC) analysis.
Determine if this is a marketing or sales expense used to acquire new customers.

Vendor: ${vendorName}
Description: ${description}
Amount: $${Math.abs(amount).toFixed(2)}

Classify into ONE of these categories:
1. marketing_paid_ads - Paid advertising (Google Ads, Meta Ads, LinkedIn Ads, display, PPC)
2. marketing_content - Content marketing, SEO, copywriting, video production
3. marketing_tools - Marketing automation, email platforms, analytics tools
4. marketing_events - Conferences, trade shows, sponsorships
5. marketing_other - Other marketing spend
6. sales_tools - CRM, sales automation, prospecting tools
7. sales_commissions - Sales rep commissions and bonuses
8. sales_travel - Sales travel, client entertainment
9. sales_other - Other sales spend
10. not_cac - NOT customer acquisition spend (operations, R&D, G&A, etc.)

Return JSON with format: {"type": "category_name", "confidence": 0.0-1.0, "reasoning": "brief explanation"}

JSON:`;

    try {
      const result = await callAIWithFallback({
        prompt,
        maxTokens: 150,
        temperature: 0.2,
        retryCount: 2,
      });

      // Parse AI response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const spendType = parsed.type as CACSpendType;
        const confidence = Math.min(1, Math.max(0, parsed.confidence || 0.6));
        
        // Validate the spend type
        const validTypes: CACSpendType[] = [
          'marketing_paid_ads', 'marketing_content', 'marketing_tools',
          'marketing_events', 'marketing_other', 'sales_tools',
          'sales_commissions', 'sales_travel', 'sales_other', 'not_cac'
        ];
        
        if (validTypes.includes(spendType)) {
          const category = spendType === 'not_cac' ? 'none' 
            : spendType.startsWith('marketing') ? 'marketing' : 'sales';
          
          return {
            spendType,
            isCACSpend: spendType !== 'not_cac',
            category,
            subcategory: this.getSubcategoryLabel(spendType),
            confidence,
            reasoning: parsed.reasoning,
            method: 'ai',
            requiresReview: confidence < 0.8,
          };
        }
      }
      
      // AI didn't return valid JSON, fall back
      return this.fallbackCACClassification(vendorName, description);
    } catch (error) {
      console.error('[CAC Classification] AI error:', error);
      return this.fallbackCACClassification(vendorName, description);
    }
  }

  /**
   * Fallback CAC classification when AI fails
   */
  private fallbackCACClassification(vendorName: string, description: string): CACClassification {
    const text = `${vendorName} ${description}`.toLowerCase();
    
    // Simple keyword-based fallback
    if (text.includes('marketing') || text.includes('ads') || text.includes('advertising')) {
      return {
        spendType: 'marketing_other',
        isCACSpend: true,
        category: 'marketing',
        subcategory: 'Marketing (Unclassified)',
        confidence: 0.5,
        method: 'fallback',
        requiresReview: true,
      };
    }
    
    if (text.includes('sales') || text.includes('crm') || text.includes('commission')) {
      return {
        spendType: 'sales_other',
        isCACSpend: true,
        category: 'sales',
        subcategory: 'Sales (Unclassified)',
        confidence: 0.5,
        method: 'fallback',
        requiresReview: true,
      };
    }
    
    // Default: not CAC spend
    return {
      spendType: 'not_cac',
      isCACSpend: false,
      category: 'none',
      subcategory: 'Not Customer Acquisition',
      confidence: 0.6,
      method: 'fallback',
      requiresReview: true,
    };
  }

  /**
   * Get human-readable subcategory label from spend type
   */
  private getSubcategoryLabel(spendType: CACSpendType): string {
    const labels: Record<CACSpendType, string> = {
      'marketing_paid_ads': 'Paid Advertising',
      'marketing_content': 'Content & SEO',
      'marketing_tools': 'Marketing Tools',
      'marketing_events': 'Events & Conferences',
      'marketing_other': 'Other Marketing',
      'sales_tools': 'Sales Tools & CRM',
      'sales_commissions': 'Sales Commissions',
      'sales_travel': 'Sales Travel & Entertainment',
      'sales_other': 'Other Sales',
      'not_cac': 'Not Customer Acquisition',
    };
    return labels[spendType] || 'Unknown';
  }

  /**
   * Batch classify multiple transactions for CAC
   * More efficient for processing many transactions at once
   */
  async batchClassifyCACSpend(
    transactions: Array<{ id: string; vendorName: string; description: string; amount: number }>
  ): Promise<Map<string, CACClassification>> {
    const results = new Map<string, CACClassification>();
    
    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (txn) => {
          const classification = await this.classifyCACSpend(
            txn.vendorName,
            txn.description,
            txn.amount
          );
          return { id: txn.id, classification };
        })
      );
      
      for (const { id, classification } of batchResults) {
        results.set(id, classification);
      }
    }
    
    return results;
  }
}

export const normalizationService = new NormalizationService();
