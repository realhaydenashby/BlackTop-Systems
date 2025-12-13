/**
 * Proprietary Vendor Embedding System
 * 
 * A local ML model for vendor name normalization without external API calls.
 * Uses TF-IDF vectorization + cosine similarity with character n-grams for fuzzy matching.
 * Learns from confirmed normalizations and user corrections.
 */

import { db } from "../db";
import { transactions } from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
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

interface VendorExample {
  rawName: string;
  normalizedName: string;
  tokens: string[];
  vector?: TFIDFVector;
}

interface TrainedVendorModel {
  version: string;
  trainedAt: string;
  exampleCount: number;
  vocabulary: string[];
  idf: { [token: string]: number };
  vendorClusters: Array<{
    normalizedName: string;
    centroid: TFIDFVector;
    rawVariants: string[];
    exampleCount: number;
  }>;
  organizationId: string;
}

const VENDOR_CONFIDENCE_THRESHOLD = 0.65;

const STOP_WORDS = new Set([
  "inc", "llc", "ltd", "corp", "corporation", "company", "co", "the", "and",
  "payment", "transfer", "ach", "wire", "debit", "credit", "to", "from",
  "services", "service", "solutions", "solution", "group", "holdings",
]);

/**
 * Generate character n-grams for fuzzy matching
 * This helps match vendors with typos or slight variations
 */
function generateNgrams(text: string, n: number = 3): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const ngrams: string[] = [];
  
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.substring(i, i + n));
  }
  
  return ngrams;
}

/**
 * Tokenize vendor name using words + character n-grams
 */
function tokenizeVendor(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word));
  
  const ngrams = generateNgrams(text, 3);
  
  return [...words, ...ngrams.map(ng => `ng_${ng}`)];
}

/**
 * Calculate term frequency for a document
 */
function calculateTF(tokens: string[]): TokenFrequency {
  const tf: TokenFrequency = {};
  const totalTokens = tokens.length;
  
  if (totalTokens === 0) return tf;
  
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  
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
  
  for (const tokens of documents) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }
  }
  
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
    const idfValue = idf[token] || Math.log(1000);
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

/**
 * Calculate edit distance (Levenshtein) for additional similarity signal
 */
function editDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate normalized edit similarity (0-1)
 */
function editSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(s1.toLowerCase(), s2.toLowerCase()) / maxLen;
}

// ============================================
// Vendor Embedding Model
// ============================================

export class VendorEmbeddingModel {
  private model: TrainedVendorModel | null = null;
  private modelPath: string;
  
  constructor(organizationId: string) {
    this.modelPath = path.join(process.cwd(), ".local", "models", `vendor_${organizationId}.json`);
  }
  
  /**
   * Load trained model from disk
   */
  async loadModel(): Promise<boolean> {
    try {
      if (fs.existsSync(this.modelPath)) {
        const data = fs.readFileSync(this.modelPath, "utf-8");
        this.model = JSON.parse(data);
        console.log(`[VendorML] Loaded model with ${this.model?.vendorClusters.length || 0} vendor clusters`);
        return true;
      }
    } catch (error) {
      console.error("[VendorML] Failed to load model:", error);
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
      console.log(`[VendorML] Saved model to ${this.modelPath}`);
    } catch (error) {
      console.error("[VendorML] Failed to save model:", error);
    }
  }
  
  /**
   * Train the vendor embedding model
   */
  async train(organizationId: string): Promise<{
    success: boolean;
    exampleCount: number;
    clusterCount: number;
    vocabularySize: number;
  }> {
    console.log(`[VendorML] Training vendor model for org ${organizationId}...`);
    
    const trainingData: Array<{ raw: string; normalized: string }> = [];
    
    try {
      const normalizedTxns = await db
        .select({
          description: transactions.description,
          vendorNormalized: transactions.vendorNormalized,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, organizationId),
            isNotNull(transactions.vendorNormalized),
            sql`${transactions.vendorNormalized} != ''`
          )
        )
        .limit(5000);
      
      for (const txn of normalizedTxns) {
        if (txn.description && txn.vendorNormalized && txn.description !== txn.vendorNormalized) {
          trainingData.push({
            raw: txn.description,
            normalized: txn.vendorNormalized,
          });
        }
      }
    } catch (error) {
      console.error("[VendorML] Error fetching transactions:", error);
    }
    
    if (trainingData.length < 10) {
      console.log(`[VendorML] Not enough training data (${trainingData.length} examples, need 10+)`);
      return { success: false, exampleCount: trainingData.length, clusterCount: 0, vocabularySize: 0 };
    }
    
    const examples: VendorExample[] = trainingData.map(td => ({
      rawName: td.raw,
      normalizedName: td.normalized,
      tokens: tokenizeVendor(td.raw),
    }));
    
    const allTokenLists = examples.map(ex => ex.tokens);
    const idf = calculateIDF(allTokenLists);
    
    for (const example of examples) {
      example.vector = calculateTFIDF(example.tokens, idf);
    }
    
    const clusters = new Map<string, {
      normalizedName: string;
      vectors: TFIDFVector[];
      rawVariants: string[];
    }>();
    
    for (const example of examples) {
      const key = example.normalizedName.toLowerCase();
      const existing = clusters.get(key);
      
      if (existing) {
        existing.vectors.push(example.vector!);
        if (!existing.rawVariants.includes(example.rawName)) {
          existing.rawVariants.push(example.rawName);
        }
      } else {
        clusters.set(key, {
          normalizedName: example.normalizedName,
          vectors: [example.vector!],
          rawVariants: [example.rawName],
        });
      }
    }
    
    const vendorClusters: TrainedVendorModel["vendorClusters"] = [];
    
    for (const [, cluster] of clusters) {
      const centroid: TFIDFVector = {};
      const allTokens = new Set(cluster.vectors.flatMap(v => Object.keys(v)));
      
      for (const token of allTokens) {
        let sum = 0;
        for (const vec of cluster.vectors) {
          sum += vec[token] || 0;
        }
        centroid[token] = sum / cluster.vectors.length;
      }
      
      vendorClusters.push({
        normalizedName: cluster.normalizedName,
        centroid,
        rawVariants: cluster.rawVariants.slice(0, 20),
        exampleCount: cluster.vectors.length,
      });
    }
    
    const vocabulary = Object.keys(idf).sort();
    
    this.model = {
      version: "1.0.0",
      trainedAt: new Date().toISOString(),
      exampleCount: trainingData.length,
      vocabulary,
      idf,
      vendorClusters,
      organizationId,
    };
    
    this.saveModel();
    
    console.log(`[VendorML] Trained with ${trainingData.length} examples, ${vendorClusters.length} clusters, ${vocabulary.length} vocabulary`);
    
    return {
      success: true,
      exampleCount: trainingData.length,
      clusterCount: vendorClusters.length,
      vocabularySize: vocabulary.length,
    };
  }
  
  /**
   * Normalize a vendor name using the trained model
   */
  normalize(rawVendorName: string): {
    normalizedName: string;
    confidence: number;
    matchedVariants: string[];
    source: "ml_vendor";
  } | null {
    if (!this.model || this.model.vendorClusters.length === 0) {
      return null;
    }
    
    const tokens = tokenizeVendor(rawVendorName);
    if (tokens.length === 0) {
      return null;
    }
    
    const vector = calculateTFIDF(tokens, this.model.idf);
    
    let bestMatch: typeof this.model.vendorClusters[0] | null = null;
    let bestScore = 0;
    
    for (const cluster of this.model.vendorClusters) {
      const cosineSim = cosineSimilarity(vector, cluster.centroid);
      
      let editSim = 0;
      for (const variant of cluster.rawVariants.slice(0, 5)) {
        const sim = editSimilarity(rawVendorName, variant);
        editSim = Math.max(editSim, sim);
      }
      
      const combinedScore = cosineSim * 0.7 + editSim * 0.3;
      
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = cluster;
      }
    }
    
    if (!bestMatch || bestScore < 0.3) {
      return null;
    }
    
    const confidence = Math.min(0.95, 0.5 + (bestScore * 0.5));
    
    if (confidence < VENDOR_CONFIDENCE_THRESHOLD) {
      return null;
    }
    
    return {
      normalizedName: bestMatch.normalizedName,
      confidence,
      matchedVariants: bestMatch.rawVariants.slice(0, 3),
      source: "ml_vendor",
    };
  }
  
  /**
   * Find similar vendors to a given name
   */
  findSimilar(vendorName: string, topK: number = 5): Array<{
    normalizedName: string;
    similarity: number;
    variants: string[];
  }> {
    if (!this.model || this.model.vendorClusters.length === 0) {
      return [];
    }
    
    const tokens = tokenizeVendor(vendorName);
    if (tokens.length === 0) {
      return [];
    }
    
    const vector = calculateTFIDF(tokens, this.model.idf);
    
    const similarities: Array<{
      normalizedName: string;
      similarity: number;
      variants: string[];
    }> = [];
    
    for (const cluster of this.model.vendorClusters) {
      const cosineSim = cosineSimilarity(vector, cluster.centroid);
      
      if (cosineSim > 0.1) {
        similarities.push({
          normalizedName: cluster.normalizedName,
          similarity: cosineSim,
          variants: cluster.rawVariants.slice(0, 3),
        });
      }
    }
    
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, topK);
  }
  
  /**
   * Get model statistics
   */
  getStats(): {
    isLoaded: boolean;
    version: string | null;
    trainedAt: string | null;
    exampleCount: number;
    clusterCount: number;
    vocabularySize: number;
    topVendors: Array<{ name: string; variants: number }>;
  } {
    const topVendors = this.model?.vendorClusters
      .sort((a, b) => b.exampleCount - a.exampleCount)
      .slice(0, 10)
      .map(c => ({ name: c.normalizedName, variants: c.rawVariants.length })) || [];
    
    return {
      isLoaded: this.model !== null,
      version: this.model?.version || null,
      trainedAt: this.model?.trainedAt || null,
      exampleCount: this.model?.exampleCount || 0,
      clusterCount: this.model?.vendorClusters.length || 0,
      vocabularySize: this.model?.vocabulary.length || 0,
      topVendors,
    };
  }
}

// ============================================
// Global Model Cache
// ============================================

const vendorModelCache = new Map<string, VendorEmbeddingModel>();

/**
 * Get or create a vendor model for an organization
 */
export async function getVendorModel(organizationId: string): Promise<VendorEmbeddingModel> {
  let model = vendorModelCache.get(organizationId);
  
  if (!model) {
    model = new VendorEmbeddingModel(organizationId);
    await model.loadModel();
    vendorModelCache.set(organizationId, model);
  }
  
  return model;
}

/**
 * Train the vendor model for an organization
 */
export async function trainVendorModel(organizationId: string): Promise<{
  success: boolean;
  exampleCount: number;
  clusterCount: number;
  vocabularySize: number;
}> {
  const model = await getVendorModel(organizationId);
  return model.train(organizationId);
}

/**
 * Normalize a vendor name using the local ML model
 * Returns null if model not trained or confidence below threshold
 */
export async function normalizeVendorLocal(
  organizationId: string,
  rawVendorName: string
): Promise<{
  normalizedName: string;
  confidence: number;
  matchedVariants: string[];
  source: "ml_vendor";
} | null> {
  const model = await getVendorModel(organizationId);
  return model.normalize(rawVendorName);
}

/**
 * Find similar vendors to a given name
 */
export async function findSimilarVendors(
  organizationId: string,
  vendorName: string,
  topK: number = 5
): Promise<Array<{
  normalizedName: string;
  similarity: number;
  variants: string[];
}>> {
  const model = await getVendorModel(organizationId);
  return model.findSimilar(vendorName, topK);
}
