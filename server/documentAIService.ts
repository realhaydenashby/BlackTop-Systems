// Google Document AI service for OCR and document processing
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
}

interface ExtractedTransaction {
  date: string | null;
  amount: number | null;
  description: string | null;
  vendor: string | null;
  category: string | null;
}

class DocumentAIService {
  private client: DocumentProcessorServiceClient | null = null;
  private config: DocumentAIConfig | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Parse service account credentials from environment
      const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      
      if (!credentials) {
        console.warn("Google Document AI credentials not configured");
        return;
      }

      const serviceAccount = JSON.parse(credentials);
      
      this.client = new DocumentProcessorServiceClient({
        credentials: serviceAccount,
      });

      // Extract project ID from service account
      this.config = {
        projectId: serviceAccount.project_id || "blacktop-systems",
        location: "us", // Default to US
        processorId: process.env.DOCUMENT_AI_PROCESSOR_ID || "default",
      };

      console.log("Document AI initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Document AI:", error);
    }
  }

  /**
   * Check if Document AI is configured and ready
   */
  isConfigured(): boolean {
    return this.client !== null && this.config !== null;
  }

  /**
   * Process a document (PDF or image) and extract text
   * @param fileBuffer - The file content as a Buffer (already fetched from storage)
   */
  async processDocument(fileBuffer: Buffer): Promise<{
    rawText: string;
    confidence: number;
    entities: any[];
  }> {
    if (!this.client || !this.config) {
      throw new Error("Document AI not configured");
    }

    try {
      const content = fileBuffer;

      // Configure the process request
      const name = `projects/${this.config.projectId}/locations/${this.config.location}/processors/${this.config.processorId}`;

      const request = {
        name,
        rawDocument: {
          content,
          mimeType: "application/pdf", // Auto-detect or specify
        },
      };

      // Process the document
      const [result] = await this.client.processDocument(request);
      const { document } = result;

      if (!document) {
        throw new Error("No document returned from Document AI");
      }

      // Extract text and entities
      const rawText = document.text || "";
      const confidence = document.pages?.[0]?.image?.content ? 0.95 : 0.0;
      const entities = document.entities || [];

      return {
        rawText,
        confidence,
        entities: entities.map((entity: any) => ({
          type: entity.type,
          mentionText: entity.mentionText,
          confidence: entity.confidence,
          normalizedValue: entity.normalizedValue,
        })),
      };
    } catch (error: any) {
      console.error("Document AI processing error:", error);
      throw new Error(`Failed to process document: ${error.message}`);
    }
  }

  /**
   * Extract transactions from a bank statement or invoice
   * Uses AI to parse the text and identify transaction-like patterns
   */
  async extractTransactions(
    rawText: string,
    documentType: "bank_statement" | "invoice" | "receipt" = "bank_statement"
  ): Promise<ExtractedTransaction[]> {
    // Use Groq AI to extract structured transaction data from the raw text
    const { callAI } = await import("./aiService");

    const systemPrompt = `You are a financial document parser. Extract transaction information from documents and return structured data.`;

    const prompt = `Parse the following ${documentType} text and extract all transactions. For each transaction, extract:
- date (YYYY-MM-DD format)
- amount (numeric value, always positive)
- description (what the transaction was for)
- vendor (who received/sent the money)
- category (e.g., Software, Marketing, Payroll, Office Supplies, etc.)

Document text:
${rawText}

Return a JSON object with this structure:
{
  "transactions": [
    {
      "date": "2024-01-15",
      "amount": 99.99,
      "description": "Monthly subscription",
      "vendor": "Adobe Inc",
      "category": "Software"
    }
  ]
}

If you cannot extract transactions, return an empty transactions array.`;

    try {
      const response = await callAI("groq", {
        prompt,
        systemPrompt,
        jsonMode: true,
        maxTokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent extraction
      });

      const parsed = JSON.parse(response.content);
      return parsed.transactions || [];
    } catch (error) {
      console.error("Transaction extraction error:", error);
      return [];
    }
  }

  /**
   * Process a document end-to-end: OCR → extract transactions
   * @param fileBuffer - The file content as a Buffer
   */
  async processAndExtractTransactions(
    fileBuffer: Buffer,
    documentType: "bank_statement" | "invoice" | "receipt" = "bank_statement"
  ): Promise<{
    rawText: string;
    confidence: number;
    transactions: ExtractedTransaction[];
  }> {
    // Step 1: OCR the document
    const { rawText, confidence } = await this.processDocument(fileBuffer);

    // Step 2: Extract transactions using AI
    const transactions = await this.extractTransactions(rawText, documentType);

    return {
      rawText,
      confidence,
      transactions,
    };
  }
}

export const documentAIService = new DocumentAIService();
