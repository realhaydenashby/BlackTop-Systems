// Vendor normalization and category classification service
import { callAI } from "./aiService";

interface NormalizedVendor {
  cleanName: string;
  confidence: number;
}

interface ClassifiedCategory {
  category: string;
  confidence: number;
  reasoning?: string;
}

export class NormalizationService {
  /**
   * Normalize a raw vendor name using AI
   * Cleans up transaction descriptions like "AMZN MKTP US*2J3K4L" -> "Amazon"
   */
  async normalizeVendorName(rawDescription: string): Promise<NormalizedVendor> {
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
      const result = await callAI("openai", {
        prompt,
        maxTokens: 50,
        temperature: 0.1, // Low temperature for consistency
      });

      const cleanName = result.content.trim();
      
      // High confidence if we got a clean response
      const confidence = cleanName.length > 0 && cleanName.length < 100 ? 0.9 : 0.5;

      return {
        cleanName: cleanName || rawDescription,
        confidence,
      };
    } catch (error) {
      console.error("Vendor normalization error:", error);
      // Fallback: simple cleanup
      return {
        cleanName: this.simpleNormalize(rawDescription),
        confidence: 0.3,
      };
    }
  }

  /**
   * Simple fallback normalization without AI
   */
  private simpleNormalize(raw: string): string {
    // Remove common prefixes
    let clean = raw
      .replace(/^(DEBIT CARD|CREDIT CARD|ACH|WIRE|CHECK|ATM)\s*/i, "")
      .replace(/\*\d+/g, "") // Remove asterisk + numbers
      .replace(/#\d+/g, "") // Remove hash + numbers
      .replace(/\s+/g, " ")
      .trim();

    // Capitalize first letter of each word
    clean = clean
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    return clean;
  }

  /**
   * Classify a transaction into a spending category using AI
   */
  async classifyCategory(
    vendorName: string,
    description: string,
    amount: number
  ): Promise<ClassifiedCategory> {
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
      const result = await callAI("openai", {
        prompt,
        maxTokens: 30,
        temperature: 0.2,
      });

      const category = result.content.trim();
      
      // Validate against known categories
      const validCategories = [
        "Software & SaaS",
        "Marketing & Advertising",
        "Payroll & Benefits",
        "Office & Equipment",
        "Professional Services",
        "Travel & Meals",
        "Operations & Misc",
      ];

      if (validCategories.includes(category)) {
        return {
          category,
          confidence: 0.85,
        };
      }

      // Fuzzy match
      const matched = validCategories.find((vc) =>
        category.toLowerCase().includes(vc.toLowerCase().split(" ")[0])
      );

      return {
        category: matched || "Operations & Misc",
        confidence: matched ? 0.7 : 0.4,
      };
    } catch (error) {
      console.error("Category classification error:", error);
      // Fallback to rule-based
      return {
        category: this.ruleBasedCategory(vendorName, description),
        confidence: 0.5,
      };
    }
  }

  /**
   * Rule-based category fallback
   */
  private ruleBasedCategory(vendor: string, description: string): string {
    const text = `${vendor} ${description}`.toLowerCase();

    if (
      text.includes("aws") ||
      text.includes("google cloud") ||
      text.includes("github") ||
      text.includes("vercel") ||
      text.includes("stripe") ||
      text.includes("saas")
    ) {
      return "Software & SaaS";
    }

    if (
      text.includes("google ads") ||
      text.includes("facebook ads") ||
      text.includes("linkedin ads") ||
      text.includes("marketing")
    ) {
      return "Marketing & Advertising";
    }

    if (
      text.includes("payroll") ||
      text.includes("gusto") ||
      text.includes("adp") ||
      text.includes("salary")
    ) {
      return "Payroll & Benefits";
    }

    if (text.includes("rent") || text.includes("office") || text.includes("wework")) {
      return "Office & Equipment";
    }

    if (
      text.includes("legal") ||
      text.includes("accounting") ||
      text.includes("consultant")
    ) {
      return "Professional Services";
    }

    if (
      text.includes("hotel") ||
      text.includes("flight") ||
      text.includes("uber") ||
      text.includes("restaurant")
    ) {
      return "Travel & Meals";
    }

    return "Operations & Misc";
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
