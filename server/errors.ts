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
  
  QUICKBOOKS_AUTH_FAILED: "QUICKBOOKS_AUTH_FAILED",
  QUICKBOOKS_SYNC_FAILED: "QUICKBOOKS_SYNC_FAILED",
  QUICKBOOKS_TOKEN_EXPIRED: "QUICKBOOKS_TOKEN_EXPIRED",
  
  YODLEE_SESSION_FAILED: "YODLEE_SESSION_FAILED",
  YODLEE_SYNC_FAILED: "YODLEE_SYNC_FAILED",
  
  AI_SERVICE_UNAVAILABLE: "AI_SERVICE_UNAVAILABLE",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  CALCULATION_ERROR: "CALCULATION_ERROR",
  
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
} as const;

export const UserFriendlyMessages: Record<string, string> = {
  [ErrorCodes.PLAID_LINK_FAILED]: "We couldn't connect to your bank. Please try again or use a different account.",
  [ErrorCodes.PLAID_SYNC_FAILED]: "We couldn't sync your latest transactions. We'll retry automatically.",
  [ErrorCodes.PLAID_TOKEN_EXPIRED]: "Your bank connection needs to be refreshed. Please reconnect your account.",
  [ErrorCodes.PLAID_ITEM_NOT_FOUND]: "This bank account is no longer connected. Please reconnect it.",
  
  [ErrorCodes.QUICKBOOKS_AUTH_FAILED]: "We couldn't connect to QuickBooks. Please try signing in again.",
  [ErrorCodes.QUICKBOOKS_SYNC_FAILED]: "We couldn't sync your QuickBooks data. We'll retry shortly.",
  [ErrorCodes.QUICKBOOKS_TOKEN_EXPIRED]: "Your QuickBooks session expired. Please reconnect your account.",
  
  [ErrorCodes.YODLEE_SESSION_FAILED]: "We couldn't start your bank connection session. Please try again.",
  [ErrorCodes.YODLEE_SYNC_FAILED]: "We couldn't sync your bank data. Please try again later.",
  
  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: "Our AI service is temporarily unavailable. Your data is safe and analysis will resume shortly.",
  [ErrorCodes.AI_RATE_LIMITED]: "We're processing a lot of requests right now. Please try again in a few minutes.",
  
  [ErrorCodes.TRANSACTION_NOT_FOUND]: "We couldn't find that transaction. It may have been deleted.",
  [ErrorCodes.ORGANIZATION_NOT_FOUND]: "We couldn't find your organization. Please contact support.",
  [ErrorCodes.USER_NOT_FOUND]: "We couldn't find your user account. Please log in again.",
  
  [ErrorCodes.INSUFFICIENT_DATA]: "We need more transaction data to provide this analysis. Connect more accounts or wait for more transactions.",
  [ErrorCodes.CALCULATION_ERROR]: "We encountered an issue calculating your metrics. We're looking into it.",
  
  [ErrorCodes.VALIDATION_ERROR]: "Some of the information provided isn't valid. Please check and try again.",
  [ErrorCodes.UNAUTHORIZED]: "You need to log in to access this feature.",
  [ErrorCodes.FORBIDDEN]: "You don't have permission to access this resource.",
};

export function createError(
  code: keyof typeof ErrorCodes,
  details?: Record<string, unknown>,
  customMessage?: string
): FinancialAPIError {
  const errorCode = ErrorCodes[code];
  const message = customMessage || UserFriendlyMessages[errorCode] || "An unexpected error occurred.";
  
  let statusCode = 500;
  if (code === "UNAUTHORIZED") statusCode = 401;
  else if (code === "FORBIDDEN") statusCode = 403;
  else if (code === "VALIDATION_ERROR") statusCode = 400;
  else if (code.includes("NOT_FOUND")) statusCode = 404;
  else if (code.includes("TOKEN_EXPIRED") || code.includes("AUTH_FAILED")) statusCode = 401;
  
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
