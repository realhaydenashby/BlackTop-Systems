import { db } from "./db";
import { eq, and, gte, lte, desc, sql, like, or } from "drizzle-orm";
import type {
  User,
  UpsertUser,
  Organization,
  InsertOrganization,
  OrganizationMember,
  InsertOrganizationMember,
  Document,
  InsertDocument,
  Transaction,
  InsertTransaction,
  Vendor,
  InsertVendor,
  Category,
  InsertCategory,
  Department,
  InsertDepartment,
  Budget,
  InsertBudget,
  BudgetLine,
  InsertBudgetLine,
  ActionPlan,
  InsertActionPlan,
  ActionItem,
  InsertActionItem,
  Insight,
  InsertInsight,
  IntegrationConnection,
  InsertIntegrationConnection,
} from "@shared/schema";
import {
  users,
  organizations,
  organizationMembers,
  documents,
  transactions,
  vendors,
  categories,
  departments,
  budgets,
  budgetLines,
  actionPlans,
  actionItems,
  insights,
  integrationConnections,
} from "@shared/schema";

export interface IStorage {
  // Users
  upsertUser(user: UpsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;

  // Organizations
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  getUserOrganizations(userId: string): Promise<Organization[]>;

  // Organization Members
  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>;
  getUserOrgMembership(userId: string, organizationId: string): Promise<OrganizationMember | undefined>;

  // Documents
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getOrganizationDocuments(organizationId: string): Promise<Document[]>;
  updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<void>;

  // Transactions
  createTransaction(txn: InsertTransaction): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  getOrganizationTransactions(organizationId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    departmentId?: string;
    vendorId?: string;
    search?: string;
  }): Promise<Transaction[]>;
  updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  deleteTransaction(id: string): Promise<void>;

  // Vendors
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  getOrganizationVendors(organizationId: string): Promise<Vendor[]>;
  findOrCreateVendor(organizationId: string, name: string): Promise<Vendor>;

  // Categories
  createCategory(category: InsertCategory): Promise<Category>;
  getOrganizationCategories(organizationId: string): Promise<Category[]>;
  findOrCreateCategory(organizationId: string, name: string): Promise<Category>;

  // Departments
  createDepartment(dept: InsertDepartment): Promise<Department>;
  getOrganizationDepartments(organizationId: string): Promise<Department[]>;
  findOrCreateDepartment(organizationId: string, name: string): Promise<Department>;

  // Budgets
  createBudget(budget: InsertBudget): Promise<Budget>;
  getBudget(id: string): Promise<Budget | undefined>;
  getOrganizationBudgets(organizationId: string): Promise<Budget[]>;
  createBudgetLine(line: InsertBudgetLine): Promise<BudgetLine>;
  getBudgetLines(budgetId: string): Promise<BudgetLine[]>;

  // Action Plans
  createActionPlan(plan: InsertActionPlan): Promise<ActionPlan>;
  getActionPlan(id: string): Promise<ActionPlan | undefined>;
  getOrganizationActionPlans(organizationId: string): Promise<ActionPlan[]>;
  createActionItem(item: InsertActionItem): Promise<ActionItem>;
  getActionItems(planId: string): Promise<ActionItem[]>;
  updateActionItem(id: string, data: Partial<InsertActionItem>): Promise<ActionItem | undefined>;

  // Insights
  createInsight(insight: InsertInsight): Promise<Insight>;
  getOrganizationInsights(organizationId: string): Promise<Insight[]>;
  deleteInsight(id: string): Promise<void>;
  deleteOrganizationInsights(organizationId: string): Promise<void>;
  replaceOrganizationInsights(organizationId: string, newInsights: InsertInsight[]): Promise<Insight[]>;

  // Integrations
  createIntegrationConnection(conn: InsertIntegrationConnection): Promise<IntegrationConnection>;
  getOrganizationIntegrations(organizationId: string): Promise<IntegrationConnection[]>;
  updateIntegrationConnection(id: string, data: Partial<InsertIntegrationConnection>): Promise<IntegrationConnection | undefined>;

  // Helper methods
  getOrganizationMember(userId: string): Promise<OrganizationMember | undefined>;
}

export class DatabaseStorage implements IStorage {
  async upsertUser(userData: UpsertUser): Promise<User> {
    if (!userData.id) {
      throw new Error("User ID is required for upsert");
    }
    
    const existing = await db.query.users.findFirst({
      where: eq(users.id, userData.id),
    });

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(users.id, userData.id))
        .returning();
      return updated;
    }

    const [user] = await db.insert(users).values(userData as any).returning();
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  async createOrganization(orgData: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(orgData).returning();
    return org;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    return await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updated] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
      with: {
        organization: true,
      },
    });
    return memberships.map((m) => m.organization);
  }

  async addOrganizationMember(memberData: InsertOrganizationMember): Promise<OrganizationMember> {
    const [member] = await db.insert(organizationMembers).values(memberData).returning();
    return member;
  }

  async getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    return await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organizationId),
      with: {
        user: true,
      },
    });
  }

  async getUserOrgMembership(userId: string, organizationId: string): Promise<OrganizationMember | undefined> {
    return await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      ),
    });
  }

  async createDocument(docData: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(docData).returning();
    return doc;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return await db.query.documents.findFirst({
      where: eq(documents.id, id),
    });
  }

  async getOrganizationDocuments(organizationId: string): Promise<Document[]> {
    return await db.query.documents.findMany({
      where: eq(documents.organizationId, organizationId),
      orderBy: [desc(documents.createdAt)],
    });
  }

  async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return updated;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async createTransaction(txnData: InsertTransaction): Promise<Transaction> {
    const [txn] = await db.insert(transactions).values(txnData).returning();
    return txn;
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    return await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: {
        vendor: true,
        category: true,
        department: true,
      },
    });
  }

  async getOrganizationTransactions(
    organizationId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      categoryId?: string;
      departmentId?: string;
      vendorId?: string;
      search?: string;
    }
  ): Promise<Transaction[]> {
    const conditions = [eq(transactions.organizationId, organizationId)];

    if (filters?.startDate) {
      conditions.push(gte(transactions.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(transactions.date, filters.endDate));
    }
    if (filters?.categoryId) {
      conditions.push(eq(transactions.categoryId, filters.categoryId));
    }
    if (filters?.departmentId) {
      conditions.push(eq(transactions.departmentId, filters.departmentId));
    }
    if (filters?.vendorId) {
      conditions.push(eq(transactions.vendorId, filters.vendorId));
    }

    const txns = await db.query.transactions.findMany({
      where: and(...conditions),
      with: {
        vendor: true,
        category: true,
        department: true,
      },
      orderBy: [desc(transactions.date)],
    });

    if (filters?.search && filters.search.length > 0) {
      const searchLower = filters.search.toLowerCase();
      return txns.filter((txn) =>
        txn.vendor?.name.toLowerCase().includes(searchLower) ||
        txn.description?.toLowerCase().includes(searchLower)
      );
    }

    return txns;
  }

  async updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db
      .update(transactions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();
    return updated;
  }

  async deleteTransaction(id: string): Promise<void> {
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async createVendor(vendorData: InsertVendor): Promise<Vendor> {
    const [vendor] = await db.insert(vendors).values(vendorData).returning();
    return vendor;
  }

  async getOrganizationVendors(organizationId: string): Promise<Vendor[]> {
    return await db.query.vendors.findMany({
      where: eq(vendors.organizationId, organizationId),
    });
  }

  async findOrCreateVendor(organizationId: string, name: string): Promise<Vendor> {
    const normalized = name.trim().toLowerCase();
    const existing = await db.query.vendors.findFirst({
      where: and(
        eq(vendors.organizationId, organizationId),
        sql`lower(${vendors.name}) = ${normalized}`
      ),
    });

    if (existing) {
      return existing;
    }

    return await this.createVendor({
      organizationId,
      name,
      normalizedName: normalized,
    });
  }

  async createCategory(categoryData: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(categoryData).returning();
    return category;
  }

  async getOrganizationCategories(organizationId: string): Promise<Category[]> {
    return await db.query.categories.findMany({
      where: eq(categories.organizationId, organizationId),
    });
  }

  async findOrCreateCategory(organizationId: string, name: string): Promise<Category> {
    const normalized = name.trim();
    const existing = await db.query.categories.findFirst({
      where: and(
        eq(categories.organizationId, organizationId),
        eq(categories.name, normalized)
      ),
    });

    if (existing) {
      return existing;
    }

    return await this.createCategory({
      organizationId,
      name: normalized,
    });
  }

  async createDepartment(deptData: InsertDepartment): Promise<Department> {
    const [dept] = await db.insert(departments).values(deptData).returning();
    return dept;
  }

  async getOrganizationDepartments(organizationId: string): Promise<Department[]> {
    return await db.query.departments.findMany({
      where: eq(departments.organizationId, organizationId),
    });
  }

  async findOrCreateDepartment(organizationId: string, name: string): Promise<Department> {
    const normalized = name.trim();
    const existing = await db.query.departments.findFirst({
      where: and(
        eq(departments.organizationId, organizationId),
        eq(departments.name, normalized)
      ),
    });

    if (existing) {
      return existing;
    }

    return await this.createDepartment({
      organizationId,
      name: normalized,
    });
  }

  async createBudget(budgetData: InsertBudget): Promise<Budget> {
    const [budget] = await db.insert(budgets).values(budgetData).returning();
    return budget;
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    return await db.query.budgets.findFirst({
      where: eq(budgets.id, id),
    });
  }

  async getOrganizationBudgets(organizationId: string): Promise<Budget[]> {
    return await db.query.budgets.findMany({
      where: eq(budgets.organizationId, organizationId),
      orderBy: [desc(budgets.createdAt)],
    });
  }

  async createBudgetLine(lineData: InsertBudgetLine): Promise<BudgetLine> {
    const [line] = await db.insert(budgetLines).values(lineData).returning();
    return line;
  }

  async getBudgetLines(budgetId: string): Promise<BudgetLine[]> {
    return await db.query.budgetLines.findMany({
      where: eq(budgetLines.budgetId, budgetId),
      with: {
        category: true,
        department: true,
      },
    });
  }

  async createActionPlan(planData: InsertActionPlan): Promise<ActionPlan> {
    const [plan] = await db.insert(actionPlans).values(planData).returning();
    return plan;
  }

  async getActionPlan(id: string): Promise<ActionPlan | undefined> {
    return await db.query.actionPlans.findFirst({
      where: eq(actionPlans.id, id),
    });
  }

  async getOrganizationActionPlans(organizationId: string): Promise<ActionPlan[]> {
    return await db.query.actionPlans.findMany({
      where: eq(actionPlans.organizationId, organizationId),
      orderBy: [desc(actionPlans.createdAt)],
    });
  }

  async createActionItem(itemData: InsertActionItem): Promise<ActionItem> {
    const [item] = await db.insert(actionItems).values(itemData).returning();
    return item;
  }

  async getActionItems(planId: string): Promise<ActionItem[]> {
    return await db.query.actionItems.findMany({
      where: eq(actionItems.actionPlanId, planId),
    });
  }

  async updateActionItem(id: string, data: Partial<InsertActionItem>): Promise<ActionItem | undefined> {
    const [updated] = await db
      .update(actionItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(actionItems.id, id))
      .returning();
    return updated;
  }

  async createInsight(insightData: InsertInsight): Promise<Insight> {
    const [insight] = await db.insert(insights).values(insightData).returning();
    return insight;
  }

  async getOrganizationInsights(organizationId: string): Promise<Insight[]> {
    return await db.query.insights.findMany({
      where: eq(insights.organizationId, organizationId),
      orderBy: [desc(insights.createdAt)],
      limit: 20,
    });
  }

  async deleteInsight(id: string): Promise<void> {
    await db.delete(insights).where(eq(insights.id, id));
  }

  async deleteOrganizationInsights(organizationId: string): Promise<void> {
    await db.delete(insights).where(eq(insights.organizationId, organizationId));
  }

  async replaceOrganizationInsights(organizationId: string, newInsights: InsertInsight[]): Promise<Insight[]> {
    return await db.transaction(async (tx) => {
      // Delete all existing insights for this organization
      await tx.delete(insights).where(eq(insights.organizationId, organizationId));
      
      // Insert new insights if any
      if (newInsights.length > 0) {
        await tx.insert(insights).values(newInsights);
      }
      
      // Return the newly inserted insights
      return await tx.query.insights.findMany({
        where: eq(insights.organizationId, organizationId),
        orderBy: [desc(insights.createdAt)],
        limit: 20,
      });
    });
  }

  async createIntegrationConnection(connData: InsertIntegrationConnection): Promise<IntegrationConnection> {
    const [conn] = await db.insert(integrationConnections).values(connData).returning();
    return conn;
  }

  async getOrganizationIntegrations(organizationId: string): Promise<IntegrationConnection[]> {
    return await db.query.integrationConnections.findMany({
      where: eq(integrationConnections.organizationId, organizationId),
    });
  }

  async updateIntegrationConnection(id: string, data: Partial<InsertIntegrationConnection>): Promise<IntegrationConnection | undefined> {
    const [updated] = await db
      .update(integrationConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(integrationConnections.id, id))
      .returning();
    return updated;
  }

  async getOrganizationMember(userId: string): Promise<OrganizationMember | undefined> {
    // Get the first organization the user is a member of
    return await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, userId),
    });
  }
}

export const storage = new DatabaseStorage();
