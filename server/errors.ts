export interface AppError extends Error {
  code: string;
  statusCode: number;
  isOperational: boolean;
  details?: Record<string, unknown>;
}

export class FinancialAPIError extends Error implements AppError {
  code: string;
  statusCode: number;
  isOperational: boolean;
  details?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string = "UNKNOWN_ERROR",
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FinancialAPIError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
  }
}

export const ErrorCodes = {
  PLAID_LINK_FAILED: "PLAID_LINK_FAILED",
  PLAID_SYNC_FAILED: "PLAID_SYNC_FAILED",
  PLAID_TOKEN_EXPIRED: "PLAID_TOKEN_EXPIRED",
  PLAID_ITEM_NOT_FOUND: "PLAID_ITEM_NOT_FOUND",
  PLAID_RATE_LIMITED: "PLAID_RATE_LIMITED",
  
  QUICKBOOKS_AUTH_FAILED: "QUICKBOOKS_AUTH_FAILED",
  QUICKBOOKS_SYNC_FAILED: "QUICKBOOKS_SYNC_FAILED",
  QUICKBOOKS_TOKEN_EXPIRED: "QUICKBOOKS_TOKEN_EXPIRED",
  QUICKBOOKS_RATE_LIMITED: "QUICKBOOKS_RATE_LIMITED",
  
  YODLEE_SESSION_FAILED: "YODLEE_SESSION_FAILED",
  YODLEE_SYNC_FAILED: "YODLEE_SYNC_FAILED",
  
  STRIPE_PAYMENT_FAILED: "STRIPE_PAYMENT_FAILED",
  STRIPE_SUBSCRIPTION_ERROR: "STRIPE_SUBSCRIPTION_ERROR",
  STRIPE_WEBHOOK_ERROR: "STRIPE_WEBHOOK_ERROR",
  
  AI_SERVICE_UNAVAILABLE: "AI_SERVICE_UNAVAILABLE",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_NORMALIZATION_FAILED: "AI_NORMALIZATION_FAILED",
  
  ENCRYPTION_FAILED: "ENCRYPTION_FAILED",
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
  
  STORAGE_READ_FAILED: "STORAGE_READ_FAILED",
  STORAGE_WRITE_FAILED: "STORAGE_WRITE_FAILED",
  DATABASE_ERROR: "DATABASE_ERROR",
  
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  BANK_ACCOUNT_NOT_FOUND: "BANK_ACCOUNT_NOT_FOUND",
  
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  CALCULATION_ERROR: "CALCULATION_ERROR",
  
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DEPENDENCY_FAILED: "DEPENDENCY_FAILED",
} as const;

export const UserFriendlyMessages: Record<string, string> = {
  [ErrorCodes.PLAID_LINK_FAILED]: "We couldn't connect to your bank. Please try again or use a different account.",
  [ErrorCodes.PLAID_SYNC_FAILED]: "We couldn't sync your latest transactions. We'll retry automatically in a few minutes.",
  [ErrorCodes.PLAID_TOKEN_EXPIRED]: "Your bank connection needs to be refreshed. Please reconnect your account in Settings > Integrations.",
  [ErrorCodes.PLAID_ITEM_NOT_FOUND]: "This bank account is no longer connected. Please reconnect it in Settings > Integrations.",
  [ErrorCodes.PLAID_RATE_LIMITED]: "Your bank is temporarily limiting our requests. We'll retry in a few minutes.",
  
  [ErrorCodes.QUICKBOOKS_AUTH_FAILED]: "We couldn't connect to QuickBooks. Please try signing in again.",
  [ErrorCodes.QUICKBOOKS_SYNC_FAILED]: "We couldn't sync your QuickBooks data. We'll retry in a few minutes.",
  [ErrorCodes.QUICKBOOKS_TOKEN_EXPIRED]: "Your QuickBooks session expired. Please reconnect in Settings > Integrations.",
  [ErrorCodes.QUICKBOOKS_RATE_LIMITED]: "QuickBooks is temporarily limiting our requests. We'll retry in a few minutes.",
  
  [ErrorCodes.YODLEE_SESSION_FAILED]: "We couldn't start your bank connection session. Please refresh and try again.",
  [ErrorCodes.YODLEE_SYNC_FAILED]: "We couldn't sync your bank data. We'll retry in a few minutes.",
  
  [ErrorCodes.STRIPE_PAYMENT_FAILED]: "Your payment couldn't be processed. Please check your payment method and try again.",
  [ErrorCodes.STRIPE_SUBSCRIPTION_ERROR]: "There was an issue with your subscription. Please contact support@blacktop.systems for help.",
  [ErrorCodes.STRIPE_WEBHOOK_ERROR]: "We received an unexpected update from Stripe. Our team has been notified.",
  
  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: "Our AI analysis is temporarily unavailable. Your data is safe - analysis will resume automatically. You can still view your transactions and raw data.",
  [ErrorCodes.AI_RATE_LIMITED]: "We're processing many requests right now. Your analysis will be ready in 2-3 minutes.",
  [ErrorCodes.AI_NORMALIZATION_FAILED]: "We couldn't automatically categorize some transactions. You can manually categorize them or wait for our retry.",
  
  [ErrorCodes.ENCRYPTION_FAILED]: "We encountered a security error while protecting your data. Please try again or contact support.",
  [ErrorCodes.DECRYPTION_FAILED]: "We couldn't access your saved credentials. Please reconnect your account.",
  
  [ErrorCodes.STORAGE_READ_FAILED]: "We couldn't load your data. Please refresh the page or try again later.",
  [ErrorCodes.STORAGE_WRITE_FAILED]: "We couldn't save your changes. Please try again in a moment.",
  [ErrorCodes.DATABASE_ERROR]: "We're experiencing database issues. Our team has been notified. Please try again shortly.",
  
  [ErrorCodes.TRANSACTION_NOT_FOUND]: "We couldn't find that transaction. It may have been deleted or moved.",
  [ErrorCodes.ORGANIZATION_NOT_FOUND]: "We couldn't find your organization. Please contact support@blacktop.systems.",
  [ErrorCodes.USER_NOT_FOUND]: "We couldn't find your user account. Please log out and log in again.",
  [ErrorCodes.BANK_ACCOUNT_NOT_FOUND]: "This bank account isn't connected. Please add it in Settings > Integrations.",
  
  [ErrorCodes.INSUFFICIENT_DATA]: "We need at least 3 months of transaction data to provide accurate analysis. Connect more accounts or check back later.",
  [ErrorCodes.CALCULATION_ERROR]: "We encountered an issue calculating your metrics. Our team has been notified and will fix this shortly.",
  
  [ErrorCodes.VALIDATION_ERROR]: "Some of the information provided isn't valid. Please check the highlighted fields and try again.",
  [ErrorCodes.UNAUTHORIZED]: "Your session has expired. Please log in again to continue.",
  [ErrorCodes.FORBIDDEN]: "You don't have permission to access this resource. Contact your organization admin for access.",
  [ErrorCodes.SERVICE_UNAVAILABLE]: "This service is temporarily unavailable. Please try again in a few minutes.",
  [ErrorCodes.DEPENDENCY_FAILED]: "A required service is temporarily down. We're working on it - please try again shortly.",
};

const StatusCodeMap: Record<string, number> = {
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  
  [ErrorCodes.TRANSACTION_NOT_FOUND]: 404,
  [ErrorCodes.ORGANIZATION_NOT_FOUND]: 404,
  [ErrorCodes.USER_NOT_FOUND]: 404,
  [ErrorCodes.BANK_ACCOUNT_NOT_FOUND]: 404,
  [ErrorCodes.PLAID_ITEM_NOT_FOUND]: 404,
  
  [ErrorCodes.PLAID_TOKEN_EXPIRED]: 401,
  [ErrorCodes.QUICKBOOKS_TOKEN_EXPIRED]: 401,
  [ErrorCodes.QUICKBOOKS_AUTH_FAILED]: 401,
  [ErrorCodes.DECRYPTION_FAILED]: 401,
  
  [ErrorCodes.AI_RATE_LIMITED]: 429,
  [ErrorCodes.PLAID_RATE_LIMITED]: 429,
  [ErrorCodes.QUICKBOOKS_RATE_LIMITED]: 429,
  
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.DATABASE_ERROR]: 503,
  
  [ErrorCodes.PLAID_LINK_FAILED]: 502,
  [ErrorCodes.PLAID_SYNC_FAILED]: 502,
  [ErrorCodes.QUICKBOOKS_SYNC_FAILED]: 502,
  [ErrorCodes.YODLEE_SESSION_FAILED]: 502,
  [ErrorCodes.YODLEE_SYNC_FAILED]: 502,
  [ErrorCodes.STRIPE_WEBHOOK_ERROR]: 502,
  [ErrorCodes.DEPENDENCY_FAILED]: 424,
  
  [ErrorCodes.STRIPE_PAYMENT_FAILED]: 402,
  [ErrorCodes.STRIPE_SUBSCRIPTION_ERROR]: 402,
  
  [ErrorCodes.AI_NORMALIZATION_FAILED]: 500,
  [ErrorCodes.ENCRYPTION_FAILED]: 500,
  [ErrorCodes.STORAGE_READ_FAILED]: 500,
  [ErrorCodes.STORAGE_WRITE_FAILED]: 500,
  [ErrorCodes.CALCULATION_ERROR]: 500,
  [ErrorCodes.INSUFFICIENT_DATA]: 422,
};

export function createError(
  code: keyof typeof ErrorCodes,
  details?: Record<string, unknown>,
  customMessage?: string
): FinancialAPIError {
  const errorCode = ErrorCodes[code];
  const message = customMessage || UserFriendlyMessages[errorCode] || "An unexpected error occurred.";
  const statusCode = StatusCodeMap[errorCode] || 500;
  
  return new FinancialAPIError(message, errorCode, statusCode, details);
}

export function handleAPIError(error: unknown): { 
  message: string; 
  code: string; 
  statusCode: number;
  details?: Record<string, unknown>;
} {
  if (error instanceof FinancialAPIError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    };
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("plaid") || message.includes("bank")) {
      return handleAPIError(createError("PLAID_SYNC_FAILED"));
    }
    
    if (message.includes("quickbooks") || message.includes("intuit")) {
      return handleAPIError(createError("QUICKBOOKS_SYNC_FAILED"));
    }
    
    if (message.includes("rate limit") || message.includes("429")) {
      return handleAPIError(createError("AI_RATE_LIMITED"));
    }
    
    if (message.includes("unauthorized") || message.includes("not authenticated")) {
      return handleAPIError(createError("UNAUTHORIZED"));
    }
    
    return {
      message: "Something went wrong. Please try again or contact support.",
      code: "UNKNOWN_ERROR",
      statusCode: 500,
    };
  }
  
  return {
    message: "An unexpected error occurred. Please try again.",
    code: "UNKNOWN_ERROR",
    statusCode: 500,
  };
}

export function logError(error: unknown, context: string): void {
  const timestamp = new Date().toISOString();
  
  if (error instanceof FinancialAPIError) {
    console.error(`[${timestamp}] [${context}] ${error.code}: ${error.message}`, {
      statusCode: error.statusCode,
      details: error.details,
      stack: error.stack,
    });
  } else if (error instanceof Error) {
    console.error(`[${timestamp}] [${context}] Error: ${error.message}`, {
      stack: error.stack,
    });
  } else {
    console.error(`[${timestamp}] [${context}] Unknown error:`, error);
  }
}

export const errorService = {
  createError,
  handleAPIError,
  logError,
  FinancialAPIError,
  ErrorCodes,
  UserFriendlyMessages,
};
