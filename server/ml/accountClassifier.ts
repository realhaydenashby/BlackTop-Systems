/**
 * Proprietary Account Classifier
 * 
 * A local machine learning model that classifies accounts without external API calls.
 * Uses TF-IDF vectorization + cosine similarity for classification.
 * Trains on user corrections to continuously improve.
 */

import { db } from "../db";
import { mappingFeedback, canonicalAccounts, accountMappings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ============================================
// Text Processing & Vectorization
// ============================================

interface TokenFrequency {
  [token: string]: number;
}

interface TFIDFVector {
  [token: string]: number;
}

interface TrainingExample {
  sourceAccountName: string;
  canonicalAccountId: string;
  canonicalCode: string;
  tokens: string[];
  vector?: TFIDFVector;
}

interface TrainedModel {
  version: string;
  trainedAt: string;
  exampleCount: number;
  vocabulary: string[];
  idf: { [token: string]: number };
  examples: Array<{
    canonicalAccountId: string;
    canonicalCode: string;
    canonicalName: string;
    vector: TFIDFVector;
    sourceNames: string[];
  }>;
  organizationId: string;
}

// Minimum confidence threshold for ML classification to be used
const ML_CONFIDENCE_THRESHOLD = 0.7;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "inc", "llc",
  "ltd", "corp", "corporation", "company", "co", "services", "service"
]);

/**
 * Tokenize and normalize text for classification
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Calculate term frequency for a document
 */
function calculateTF(tokens: string[]): TokenFrequency {
  const tf: TokenFrequency = {};
  const totalTokens = tokens.length;
  
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  
  // Normalize by document length
  for (const token in tf) {
    tf[token] = tf[token] / totalTokens;
  }
  
  return tf;
}

/**
 * Calculate inverse document frequency across all documents
 */
function calculateIDF(documents: string[][]): { [token: string]: number } {
  const docCount = documents.length;
  const docFreq: { [token: string]: number } = {};
  
  // Count how many documents contain each token
  for (const tokens of documents) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }
  }
  
  // Calculate IDF with smoothing
  const idf: { [token: string]: number } = {};
  for (const token in docFreq) {
    idf[token] = Math.log((docCount + 1) / (docFreq[token] + 1)) + 1;
  }
  
  return idf;
}

/**
 * Calculate TF-IDF vector for a document
 */
function calculateTFIDF(tokens: string[], idf: { [token: string]: number }): TFIDFVector {
  const tf = calculateTF(tokens);
  const tfidf: TFIDFVector = {};
  
  for (const token in tf) {
    const idfValue = idf[token] || Math.log(1000); // High IDF for unknown tokens
    tfidf[token] = tf[token] * idfValue;
  }
  
  return tfidf;
}

/**
 * Calculate cosine similarity between two TF-IDF vectors
 */
function cosineSimilarity(vec1: TFIDFVector, vec2: TFIDFVector): number {
  const allTokens = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (const token of allTokens) {
    const v1 = vec1[token] || 0;
    const v2 = vec2[token] || 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }
  
  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ============================================
// Account Classifier
// ============================================

export class AccountClassifier {
  private model: TrainedModel | null = null;
  private modelPath: string;
  
  constructor(organizationId: string) {
    this.modelPath = path.join(process.cwd(), ".local", "models", `classifier_${organizationId}.json`);
  }
  
  /**
   * Load trained model from disk
   */
  async loadModel(): Promise<boolean> {
    try {
      if (fs.existsSync(this.modelPath)) {
        const data = fs.readFileSync(this.modelPath, "utf-8");
        this.model = JSON.parse(data);
        console.log(`[ML] Loaded classifier model with ${this.model?.exampleCount || 0} examples`);
        return true;
      }
    } catch (error) {
      console.error("[ML] Failed to load model:", error);
    }
    return false;
  }
  
  /**
   * Save trained model to disk
   */
  private saveModel(): void {
    if (!this.model) return;
    
    try {
      const dir = path.dirname(this.modelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.modelPath, JSON.stringify(this.model, null, 2));
      console.log(`[ML] Saved classifier model to ${this.modelPath}`);
    } catch (error) {
      console.error("[ML] Failed to save model:", error);
    }
  }
  
  /**
   * Train the classifier on correction data
   */
  async train(organizationId: string): Promise<{
    success: boolean;
    exampleCount: number;
    vocabularySize: number;
  }> {
    console.log(`[ML] Training account classifier for org ${organizationId}...`);
    
    // Get all corrections and high-confidence mappings
    const corrections = await db
      .select({
        sourceAccountName: mappingFeedback.sourceAccountName,
        canonicalAccountId: mappingFeedback.correctedCanonicalAccountId,
      })
      .from(mappingFeedback)
      .where(
        and(
          eq(mappingFeedback.organizationId, organizationId),
          eq(mappingFeedback.status, "corrected")
        )
      );
    
    const approvals = await db
      .select({
        sourceAccountName: mappingFeedback.sourceAccountName,
        canonicalAccountId: mappingFeedback.suggestedCanonicalAccountId,
      })
      .from(mappingFeedback)
      .where(
        and(
          eq(mappingFeedback.organizationId, organizationId),
          eq(mappingFeedback.status, "approved")
        )
      );
    
    // Also include high-confidence existing mappings
    const highConfMappings = await db
      .select({
        sourceAccountName: accountMappings.sourceAccountName,
        canonicalAccountId: accountMappings.canonicalAccountId,
      })
      .from(accountMappings)
      .where(
        and(
          eq(accountMappings.organizationId, organizationId),
          eq(accountMappings.confidence, "high")
        )
      );
    
    // Combine all training data
    const allExamples = [
      ...corrections.filter(c => c.sourceAccountName && c.canonicalAccountId),
      ...approvals.filter(a => a.sourceAccountName && a.canonicalAccountId),
      ...highConfMappings.filter(m => m.sourceAccountName && m.canonicalAccountId),
    ] as Array<{ sourceAccountName: string; canonicalAccountId: string }>;
    
    if (allExamples.length < 5) {
      console.log(`[ML] Not enough training data (${allExamples.length} examples, need 5+)`);
      return { success: false, exampleCount: allExamples.length, vocabularySize: 0 };
    }
    
    // Get canonical account codes and names (cached in model to avoid DB queries during classification)
    const accounts = await db.select().from(canonicalAccounts);
    const accountMap = new Map(accounts.map(a => [a.id, { code: a.code, name: a.name }]));
    
    // Prepare training examples
    const trainingExamples: TrainingExample[] = allExamples.map(ex => {
      const accountInfo = accountMap.get(ex.canonicalAccountId);
      return {
        sourceAccountName: ex.sourceAccountName,
        canonicalAccountId: ex.canonicalAccountId,
        canonicalCode: accountInfo?.code || "UNKNOWN",
        tokens: tokenize(ex.sourceAccountName),
      };
    });
    
    // Calculate IDF across all documents
    const allTokenLists = trainingExamples.map(ex => ex.tokens);
    const idf = calculateIDF(allTokenLists);
    
    // Calculate TF-IDF vectors for each example
    for (const example of trainingExamples) {
      example.vector = calculateTFIDF(example.tokens, idf);
    }
    
    // Group examples by canonical account
    const groupedExamples = new Map<string, {
      canonicalAccountId: string;
      canonicalCode: string;
      canonicalName: string;
      vectors: TFIDFVector[];
      sourceNames: string[];
    }>();
    
    for (const example of trainingExamples) {
      const existing = groupedExamples.get(example.canonicalAccountId);
      const accountInfo = accountMap.get(example.canonicalAccountId);
      if (existing) {
        existing.vectors.push(example.vector!);
        if (!existing.sourceNames.includes(example.sourceAccountName)) {
          existing.sourceNames.push(example.sourceAccountName);
        }
      } else {
        groupedExamples.set(example.canonicalAccountId, {
          canonicalAccountId: example.canonicalAccountId,
          canonicalCode: example.canonicalCode,
          canonicalName: accountInfo?.name || "Unknown",
          vectors: [example.vector!],
          sourceNames: [example.sourceAccountName],
        });
      }
    }
    
    // Average vectors for each canonical account (centroid)
    const modelExamples: TrainedModel["examples"] = [];
    
    for (const [, group] of groupedExamples) {
      const centroid: TFIDFVector = {};
      const allTokens = new Set(group.vectors.flatMap(v => Object.keys(v)));
      
      for (const token of allTokens) {
        let sum = 0;
        for (const vec of group.vectors) {
          sum += vec[token] || 0;
        }
        centroid[token] = sum / group.vectors.length;
      }
      
      modelExamples.push({
        canonicalAccountId: group.canonicalAccountId,
        canonicalCode: group.canonicalCode,
        canonicalName: group.canonicalName,
        vector: centroid,
        sourceNames: group.sourceNames.slice(0, 10), // Keep top 10 for reference
      });
    }
    
    // Build vocabulary
    const vocabulary = Object.keys(idf).sort();
    
    // Create model
    this.model = {
      version: "1.0.0",
      trainedAt: new Date().toISOString(),
      exampleCount: allExamples.length,
      vocabulary,
      idf,
      examples: modelExamples,
      organizationId,
    };
    
    // Save to disk
    this.saveModel();
    
    console.log(`[ML] Trained classifier with ${allExamples.length} examples, ${vocabulary.length} vocabulary, ${modelExamples.length} classes`);
    
    return {
      success: true,
      exampleCount: allExamples.length,
      vocabularySize: vocabulary.length,
    };
  }
  
  /**
   * Classify an account name using the trained model
   * Returns null if model not trained, no tokens, or confidence below threshold
   */
  classify(sourceAccountName: string): {
    canonicalAccountId: string;
    canonicalCode: string;
    canonicalName: string;
    confidence: number;
    matchedExamples: string[];
  } | null {
    if (!this.model || this.model.examples.length === 0) {
      return null;
    }
    
    // Tokenize and vectorize the input
    const tokens = tokenize(sourceAccountName);
    if (tokens.length === 0) {
      return null;
    }
    
    const vector = calculateTFIDF(tokens, this.model.idf);
    
    // Find most similar class
    let bestMatch: typeof this.model.examples[0] | null = null;
    let bestSimilarity = 0;
    
    for (const example of this.model.examples) {
      const similarity = cosineSimilarity(vector, example.vector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = example;
      }
    }
    
    if (!bestMatch || bestSimilarity < 0.1) {
      return null;
    }
    
    // Convert similarity to confidence (scale 0.5-0.95)
    const confidence = Math.min(0.95, 0.5 + (bestSimilarity * 0.45));
    
    // Enforce single confidence threshold here - only return if confidence is high enough
    if (confidence < ML_CONFIDENCE_THRESHOLD) {
      return null;
    }
    
    return {
      canonicalAccountId: bestMatch.canonicalAccountId,
      canonicalCode: bestMatch.canonicalCode,
      canonicalName: bestMatch.canonicalName,
      confidence,
      matchedExamples: bestMatch.sourceNames.slice(0, 3),
    };
  }
  
  /**
   * Get model statistics
   */
  getStats(): {
    isLoaded: boolean;
    version: string | null;
    trainedAt: string | null;
    exampleCount: number;
    vocabularySize: number;
    classCount: number;
  } {
    return {
      isLoaded: this.model !== null,
      version: this.model?.version || null,
      trainedAt: this.model?.trainedAt || null,
      exampleCount: this.model?.exampleCount || 0,
      vocabularySize: this.model?.vocabulary.length || 0,
      classCount: this.model?.examples.length || 0,
    };
  }
}

// ============================================
// Global Classifier Cache
// ============================================

const classifierCache = new Map<string, AccountClassifier>();

/**
 * Get or create a classifier for an organization
 */
export async function getClassifier(organizationId: string): Promise<AccountClassifier> {
  let classifier = classifierCache.get(organizationId);
  
  if (!classifier) {
    classifier = new AccountClassifier(organizationId);
    await classifier.loadModel();
    classifierCache.set(organizationId, classifier);
  }
  
  return classifier;
}

/**
 * Train the classifier for an organization
 */
export async function trainClassifier(organizationId: string): Promise<{
  success: boolean;
  exampleCount: number;
  vocabularySize: number;
}> {
  const classifier = await getClassifier(organizationId);
  return classifier.train(organizationId);
}

/**
 * Classify an account using the local ML model
 * Returns null if model not trained or confidence below threshold (0.7)
 * All canonical account info is cached in the model - no DB queries needed
 */
export async function classifyAccountLocal(
  organizationId: string,
  sourceAccountName: string
): Promise<{
  canonicalAccountId: string;
  canonicalCode: string;
  canonicalName: string;
  confidence: number;
  source: "ml_local";
  matchedExamples: string[];
} | null> {
  const classifier = await getClassifier(organizationId);
  const result = classifier.classify(sourceAccountName);
  
  if (!result) {
    return null;
  }
  
  return {
    ...result,
    source: "ml_local" as const,
  };
}
