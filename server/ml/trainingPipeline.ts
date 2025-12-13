/**
 * Model Training Pipeline
 * 
 * Automated retraining system that monitors correction data accumulation
 * and triggers model updates when sufficient new data is available.
 * 
 * Key Features:
 * - Monitors correction counts per organization
 * - Triggers retraining when thresholds are met
 * - Tracks model versions and performance
 * - Supports both scheduled and on-demand training
 */

import { db } from "../db";
import { 
  mappingFeedback, 
  transactions, 
  organizations,
  aiContextNotes,
  modelTrainingHistory,
} from "@shared/schema";
import { eq, and, gte, count, desc, isNotNull } from "drizzle-orm";
import { AccountClassifier } from "./accountClassifier";
import { VendorEmbeddingModel } from "./vendorEmbeddings";
import { SpendingAnomalyModel } from "./spendingAnomalyModel";
import { subDays, format } from "date-fns";

// ============================================
// Types
// ============================================

export interface TrainingConfig {
  minCorrectionsForRetrain: number;
  minTransactionsForVendorRetrain: number;
  minFeedbackForAnomalyRetrain: number;
  cooldownHours: number;
  maxConcurrentTraining: number;
}

export interface ModelTrainingStatus {
  modelName: string;
  organizationId: string;
  lastTrainedAt: Date | null;
  correctionsSinceLastTrain: number;
  readyForRetrain: boolean;
  currentVersion: string;
  performance: ModelPerformance | null;
}

export interface ModelPerformance {
  accuracy: number;
  confidenceAvg: number;
  predictionCount: number;
  errorRate: number;
}

export interface TrainingResult {
  modelName: string;
  organizationId: string;
  success: boolean;
  trainedAt: Date;
  exampleCount: number;
  duration: number;
  previousVersion: string;
  newVersion: string;
  performanceImprovement: number | null;
  error?: string;
}

interface TrainingRecord {
  organizationId: string;
  modelName: string;
  trainedAt: Date;
  version: string;
  exampleCount: number;
  performance: ModelPerformance | null;
}

// ============================================
// Training Pipeline
// ============================================

const DEFAULT_CONFIG: TrainingConfig = {
  minCorrectionsForRetrain: 10,
  minTransactionsForVendorRetrain: 50,
  minFeedbackForAnomalyRetrain: 20,
  cooldownHours: 24,
  maxConcurrentTraining: 3,
};

class ModelTrainingPipeline {
  private config: TrainingConfig;
  private activeTraining: Set<string>;
  private scheduledInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<TrainingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeTraining = new Set();
  }
  
  /**
   * Check if an organization has enough new data to warrant retraining
   */
  async checkRetrainingNeeded(organizationId: string): Promise<{
    accountClassifier: boolean;
    vendorEmbeddings: boolean;
    anomalyModel: boolean;
    details: Record<string, { count: number; threshold: number; ready: boolean }>;
  }> {
    const lastTrained = await this.getLastTrainedAt(organizationId);
    const cutoffDate = lastTrained || subDays(new Date(), 365);
    
    // Count new corrections since last training
    const [correctionCount, vendorCount, feedbackCount] = await Promise.all([
      this.countNewCorrections(organizationId, cutoffDate),
      this.countNewVendorNormalizations(organizationId, cutoffDate),
      this.countNewFeedback(organizationId, cutoffDate),
    ]);
    
    const accountClassifierReady = correctionCount >= this.config.minCorrectionsForRetrain;
    const vendorEmbeddingsReady = vendorCount >= this.config.minTransactionsForVendorRetrain;
    const anomalyModelReady = feedbackCount >= this.config.minFeedbackForAnomalyRetrain;
    
    return {
      accountClassifier: accountClassifierReady,
      vendorEmbeddings: vendorEmbeddingsReady,
      anomalyModel: anomalyModelReady,
      details: {
        accountClassifier: {
          count: correctionCount,
          threshold: this.config.minCorrectionsForRetrain,
          ready: accountClassifierReady,
        },
        vendorEmbeddings: {
          count: vendorCount,
          threshold: this.config.minTransactionsForVendorRetrain,
          ready: vendorEmbeddingsReady,
        },
        anomalyModel: {
          count: feedbackCount,
          threshold: this.config.minFeedbackForAnomalyRetrain,
          ready: anomalyModelReady,
        },
      },
    };
  }
  
  private async countNewCorrections(organizationId: string, since: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(mappingFeedback)
        .where(
          and(
            eq(mappingFeedback.organizationId, organizationId),
            gte(mappingFeedback.createdAt, since)
          )
        );
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  }
  
  private async countNewVendorNormalizations(organizationId: string, since: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, organizationId),
            isNotNull(transactions.vendorNormalized),
            gte(transactions.date, since)
          )
        );
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  }
  
  private async countNewFeedback(organizationId: string, since: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(aiContextNotes)
        .where(
          and(
            eq(aiContextNotes.organizationId, organizationId),
            gte(aiContextNotes.createdAt, since)
          )
        );
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  }
  
  /**
   * Get last trained date for any model in this org (from database)
   */
  private async getLastTrainedAt(organizationId: string): Promise<Date | null> {
    try {
      const result = await db
        .select({ trainedAt: modelTrainingHistory.trainedAt })
        .from(modelTrainingHistory)
        .where(eq(modelTrainingHistory.organizationId, organizationId))
        .orderBy(desc(modelTrainingHistory.trainedAt))
        .limit(1);
      return result[0]?.trainedAt || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Train a specific model for an organization
   */
  async trainModel(
    organizationId: string, 
    modelName: "accountClassifier" | "vendorEmbeddings" | "anomalyModel"
  ): Promise<TrainingResult> {
    const trainingKey = `${organizationId}:${modelName}`;
    
    // Check if already training
    if (this.activeTraining.has(trainingKey)) {
      return {
        modelName,
        organizationId,
        success: false,
        trainedAt: new Date(),
        exampleCount: 0,
        duration: 0,
        previousVersion: "",
        newVersion: "",
        performanceImprovement: null,
        error: "Training already in progress",
      };
    }
    
    // Check cooldown
    const lastTrained = await this.getLastTrainedForModel(organizationId, modelName);
    if (lastTrained) {
      const hoursSinceLast = (Date.now() - lastTrained.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < this.config.cooldownHours) {
        return {
          modelName,
          organizationId,
          success: false,
          trainedAt: new Date(),
          exampleCount: 0,
          duration: 0,
          previousVersion: "",
          newVersion: "",
          performanceImprovement: null,
          error: `Cooldown active. ${(this.config.cooldownHours - hoursSinceLast).toFixed(1)} hours remaining`,
        };
      }
    }
    
    // Start training
    this.activeTraining.add(trainingKey);
    const startTime = Date.now();
    const previousVersion = await this.getCurrentVersion(organizationId, modelName);
    
    try {
      let result: { success: boolean; exampleCount: number; vocabularySize?: number; clusterCount?: number };
      
      switch (modelName) {
        case "accountClassifier": {
          const classifier = new AccountClassifier();
          result = await classifier.train(organizationId);
          break;
        }
        case "vendorEmbeddings": {
          const embeddings = new VendorEmbeddingModel();
          result = await embeddings.train(organizationId);
          break;
        }
        case "anomalyModel": {
          const anomaly = new SpendingAnomalyModel(organizationId);
          const anomalyResult = await anomaly.train();
          result = { 
            success: anomalyResult.success, 
            exampleCount: anomalyResult.transactionCount 
          };
          break;
        }
      }
      
      const duration = Date.now() - startTime;
      const newVersion = this.generateVersion();
      
      // Record training to database
      await this.recordTraining(organizationId, modelName, newVersion, result.exampleCount, result.success);
      
      console.log(`[TrainingPipeline] ${modelName} trained for org ${organizationId}: ${result.exampleCount} examples in ${duration}ms`);
      
      return {
        modelName,
        organizationId,
        success: result.success,
        trainedAt: new Date(),
        exampleCount: result.exampleCount,
        duration,
        previousVersion,
        newVersion,
        performanceImprovement: null, // Would require A/B testing to measure
      };
    } catch (error) {
      console.error(`[TrainingPipeline] Error training ${modelName}:`, error);
      return {
        modelName,
        organizationId,
        success: false,
        trainedAt: new Date(),
        exampleCount: 0,
        duration: Date.now() - startTime,
        previousVersion,
        newVersion: "",
        performanceImprovement: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      this.activeTraining.delete(trainingKey);
    }
  }
  
  /**
   * Get last trained date for a specific model (from database)
   */
  private async getLastTrainedForModel(organizationId: string, modelName: string): Promise<Date | null> {
    try {
      const result = await db
        .select({ trainedAt: modelTrainingHistory.trainedAt })
        .from(modelTrainingHistory)
        .where(
          and(
            eq(modelTrainingHistory.organizationId, organizationId),
            eq(modelTrainingHistory.modelName, modelName)
          )
        )
        .orderBy(desc(modelTrainingHistory.trainedAt))
        .limit(1);
      return result[0]?.trainedAt || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get current version for a specific model (from database)
   */
  private async getCurrentVersion(organizationId: string, modelName: string): Promise<string> {
    try {
      const result = await db
        .select({ version: modelTrainingHistory.version })
        .from(modelTrainingHistory)
        .where(
          and(
            eq(modelTrainingHistory.organizationId, organizationId),
            eq(modelTrainingHistory.modelName, modelName)
          )
        )
        .orderBy(desc(modelTrainingHistory.trainedAt))
        .limit(1);
      return result[0]?.version || "1.0.0";
    } catch {
      return "1.0.0";
    }
  }
  
  private generateVersion(): string {
    const now = new Date();
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${Date.now() % 10000}`;
  }
  
  /**
   * Record training to database
   */
  private async recordTraining(
    organizationId: string, 
    modelName: string, 
    version: string, 
    exampleCount: number,
    success: boolean
  ): Promise<void> {
    try {
      await db.insert(modelTrainingHistory).values({
        organizationId,
        modelName,
        version,
        exampleCount,
        success,
        trainedAt: new Date(),
      });
    } catch (error) {
      console.error("[TrainingPipeline] Failed to record training:", error);
    }
  }
  
  /**
   * Run automatic training check for all organizations
   * Trains models that have accumulated enough correction data
   */
  async runAutoTraining(): Promise<TrainingResult[]> {
    console.log("[TrainingPipeline] Running automatic training check...");
    
    const results: TrainingResult[] = [];
    
    // Get all organizations
    const orgs = await db.select({ id: organizations.id }).from(organizations).limit(100);
    
    for (const org of orgs) {
      // Check active training limit
      if (this.activeTraining.size >= this.config.maxConcurrentTraining) {
        console.log("[TrainingPipeline] Max concurrent training reached, stopping");
        break;
      }
      
      const needed = await this.checkRetrainingNeeded(org.id);
      
      // Train models that are ready
      if (needed.accountClassifier) {
        const result = await this.trainModel(org.id, "accountClassifier");
        results.push(result);
      }
      
      if (needed.vendorEmbeddings) {
        const result = await this.trainModel(org.id, "vendorEmbeddings");
        results.push(result);
      }
      
      if (needed.anomalyModel) {
        const result = await this.trainModel(org.id, "anomalyModel");
        results.push(result);
      }
    }
    
    console.log(`[TrainingPipeline] Auto-training complete. ${results.filter(r => r.success).length}/${results.length} models trained successfully`);
    return results;
  }
  
  /**
   * Get training status for all models of an organization
   */
  async getTrainingStatus(organizationId: string): Promise<ModelTrainingStatus[]> {
    const needed = await this.checkRetrainingNeeded(organizationId);
    const models = ["accountClassifier", "vendorEmbeddings", "anomalyModel"] as const;
    
    const statuses = await Promise.all(
      models.map(async (modelName) => {
        const [lastTrained, currentVersion] = await Promise.all([
          this.getLastTrainedForModel(organizationId, modelName),
          this.getCurrentVersion(organizationId, modelName),
        ]);
        const details = needed.details[modelName];
        
        return {
          modelName,
          organizationId,
          lastTrainedAt: lastTrained,
          correctionsSinceLastTrain: details.count,
          readyForRetrain: details.ready,
          currentVersion,
          performance: null, // Would need prediction tracking to compute
        };
      })
    );
    
    return statuses;
  }
  
  /**
   * Schedule periodic training checks
   */
  startScheduledTraining(intervalHours: number = 24): void {
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
    }
    
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    this.scheduledInterval = setInterval(() => {
      this.runAutoTraining().catch(err => {
        console.error("[TrainingPipeline] Scheduled training error:", err);
      });
    }, intervalMs);
    
    console.log(`[TrainingPipeline] Scheduled training every ${intervalHours} hours`);
  }
  
  stopScheduledTraining(): void {
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
      console.log("[TrainingPipeline] Scheduled training stopped");
    }
  }
  
  /**
   * Get training history for an organization (from database)
   */
  async getTrainingHistory(organizationId: string): Promise<TrainingRecord[]> {
    try {
      const results = await db
        .select({
          organizationId: modelTrainingHistory.organizationId,
          modelName: modelTrainingHistory.modelName,
          trainedAt: modelTrainingHistory.trainedAt,
          version: modelTrainingHistory.version,
          exampleCount: modelTrainingHistory.exampleCount,
        })
        .from(modelTrainingHistory)
        .where(eq(modelTrainingHistory.organizationId, organizationId))
        .orderBy(desc(modelTrainingHistory.trainedAt))
        .limit(50);
      
      return results.map(r => ({
        organizationId: r.organizationId,
        modelName: r.modelName,
        trainedAt: r.trainedAt,
        version: r.version,
        exampleCount: r.exampleCount,
        performance: null,
      }));
    } catch {
      return [];
    }
  }
}

// ============================================
// Singleton and Exports
// ============================================

const trainingPipeline = new ModelTrainingPipeline();

export async function checkRetrainingNeeded(organizationId: string) {
  return trainingPipeline.checkRetrainingNeeded(organizationId);
}

export async function trainModel(
  organizationId: string, 
  modelName: "accountClassifier" | "vendorEmbeddings" | "anomalyModel"
) {
  return trainingPipeline.trainModel(organizationId, modelName);
}

export async function runAutoTraining() {
  return trainingPipeline.runAutoTraining();
}

export async function getTrainingStatus(organizationId: string) {
  return trainingPipeline.getTrainingStatus(organizationId);
}

export function startScheduledTraining(intervalHours?: number) {
  return trainingPipeline.startScheduledTraining(intervalHours);
}

export function stopScheduledTraining() {
  return trainingPipeline.stopScheduledTraining();
}

export async function getTrainingHistory(organizationId: string) {
  return trainingPipeline.getTrainingHistory(organizationId);
}

export { ModelTrainingPipeline };
