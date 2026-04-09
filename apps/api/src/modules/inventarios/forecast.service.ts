import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

type Period = "daily" | "weekly" | "monthly";
type Trend = "increasing" | "decreasing" | "stable";

interface ConsumptionBucket {
  period: string;
  quantity: number;
  cost: number;
}

interface ForecastWeek {
  week: string;
  predictedQuantity: number;
  confidence: number;
}

interface ProductForecast {
  product: { id: string; sku: string; name: string; unitOfMeasure: string; costPerUnit: number };
  branch?: { id: string; name: string } | null;
  historical: ConsumptionBucket[];
  forecast: ForecastWeek[];
  trend: Trend;
  avgWeeklyConsumption: number;
  avgDailyConsumption: number;
}

interface BranchProductForecast extends ProductForecast {
  currentStock: number;
  daysOfStockLeft: number | null;
  reorderNeeded: boolean;
}

interface ReorderAlert {
  productId: string;
  productName: string;
  productSku: string;
  branchId: string;
  branchName: string;
  currentStock: number;
  daysOfStockLeft: number | null;
  avgDailyConsumption: number;
  forecastedWeeklyQuantity: number;
}

interface ForecastSummary {
  criticalStockBranches: ReorderAlert[];
  highestGrowthProducts: Array<{
    productId: string;
    productName: string;
    productSku: string;
    growthRate: number;
    avgWeeklyConsumption: number;
  }>;
  decliningProducts: Array<{
    productId: string;
    productName: string;
    productSku: string;
    declineRate: number;
    avgWeeklyConsumption: number;
  }>;
  forecastedCostByBranch: Array<{
    branchId: string;
    branchName: string;
    totalCost: number;
  }>;
  reorderAlerts: ReorderAlert[];
}

interface SuggestedRequisitionItem {
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  currentStock: number;
  forecastedWeeklyConsumption: number;
  suggestedQuantity: number;
  estimatedCost: number;
  daysOfStockLeft: number | null;
  urgency: "critical" | "warning" | "normal";
}

@Injectable()
export class ForecastService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // getConsumptionHistory
  // ---------------------------------------------------------------------------
  async getConsumptionHistory(
    orgId: string,
    productId: string,
    branchId: string | undefined,
    period: Period,
  ): Promise<ConsumptionBucket[]> {
    const consumptionTypes = ["OUT", "TRANSFER_OUT", "WASTE", "SALE_DEDUCTION"];

    const whereClause: any = {
      product: { organizationId: orgId },
      productId,
      movementType: { in: consumptionTypes as any },
    };
    if (branchId) {
      whereClause.branchId = branchId;
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: whereClause,
      include: { product: true },
      orderBy: { timestamp: "asc" },
    });

    const buckets = new Map<string, { quantity: number; cost: number }>();

    for (const m of movements) {
      const key = this.getPeriodKey(m.timestamp, period);
      const existing = buckets.get(key) || { quantity: 0, cost: 0 };
      const qty = Math.abs(Number(m.quantity));
      const unitCost = m.unitCost ? Number(m.unitCost) : Number(m.product.costPerUnit);
      existing.quantity += qty;
      existing.cost += qty * unitCost;
      buckets.set(key, existing);
    }

    return Array.from(buckets.entries())
      .map(([period, data]) => ({
        period,
        quantity: Math.round(data.quantity * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  // ---------------------------------------------------------------------------
  // forecastDemand — single product forecast
  // ---------------------------------------------------------------------------
  async forecastDemand(
    orgId: string,
    productId: string,
    branchId?: string,
    weeksAhead: number = 4,
  ): Promise<ProductForecast> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
    });
    if (!product) {
      throw new Error("Product not found");
    }

    let branch: { id: string; name: string } | null = null;
    if (branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: orgId },
      });
      if (b) branch = { id: b.id, name: b.name };
    }

    const historical = await this.getConsumptionHistory(orgId, productId, branchId, "weekly");

    if (historical.length === 0) {
      return {
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          unitOfMeasure: product.unitOfMeasure,
          costPerUnit: Number(product.costPerUnit),
        },
        branch,
        historical: [],
        forecast: [],
        trend: "stable",
        avgWeeklyConsumption: 0,
        avgDailyConsumption: 0,
      };
    }

    // Weighted moving average using last 4 weeks (or less if not available)
    const recentWeeks = historical.slice(-4);
    const weights = this.getWeights(recentWeeks.length);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    const weightedAvg =
      recentWeeks.reduce((sum, bucket, i) => sum + bucket.quantity * weights[i], 0) / totalWeight;

    // Trend calculation: compare first half vs second half of history
    const trend = this.calculateTrend(historical);

    // Seasonality: compare same weeks from last year if data exists
    const trendMultiplier = trend === "increasing" ? 1.02 : trend === "decreasing" ? 0.98 : 1.0;

    // Generate forecast
    const lastWeekKey = historical[historical.length - 1].period;
    const forecast: ForecastWeek[] = [];
    for (let i = 1; i <= weeksAhead; i++) {
      const weekKey = this.getNextWeekKey(lastWeekKey, i);
      const predicted = weightedAvg * Math.pow(trendMultiplier, i);
      const confidence = this.calculateConfidence(historical, i);
      forecast.push({
        week: weekKey,
        predictedQuantity: Math.round(predicted * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    const totalQty = historical.reduce((s, h) => s + h.quantity, 0);
    const avgWeekly = totalQty / historical.length;

    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        unitOfMeasure: product.unitOfMeasure,
        costPerUnit: Number(product.costPerUnit),
      },
      branch,
      historical,
      forecast,
      trend,
      avgWeeklyConsumption: Math.round(avgWeekly * 100) / 100,
      avgDailyConsumption: Math.round((avgWeekly / 7) * 100) / 100,
    };
  }

  // ---------------------------------------------------------------------------
  // forecastByBranch — all products in a branch
  // ---------------------------------------------------------------------------
  async forecastByBranch(
    orgId: string,
    branchId: string,
    weeksAhead: number = 4,
  ): Promise<BranchProductForecast[]> {
    // Get all products with inventory in this branch
    const inventory = await this.prisma.branchInventory.findMany({
      where: {
        branchId,
        product: { organizationId: orgId },
      },
      include: { product: true },
    });

    const results: BranchProductForecast[] = [];

    for (const inv of inventory) {
      const forecast = await this.forecastDemand(orgId, inv.productId, branchId, weeksAhead);
      const currentStock = Number(inv.currentQuantity);
      const daysOfStockLeft =
        forecast.avgDailyConsumption > 0
          ? Math.round((currentStock / forecast.avgDailyConsumption) * 10) / 10
          : null;
      const reorderNeeded = daysOfStockLeft !== null && daysOfStockLeft < 7;

      results.push({
        ...forecast,
        currentStock,
        daysOfStockLeft,
        reorderNeeded,
      });
    }

    // Sort by predicted quantity desc (highest consumption first)
    results.sort((a, b) => {
      const aQty = a.forecast[0]?.predictedQuantity ?? 0;
      const bQty = b.forecast[0]?.predictedQuantity ?? 0;
      return bQty - aQty;
    });

    return results;
  }

  // ---------------------------------------------------------------------------
  // forecastSummary — org-wide dashboard
  // ---------------------------------------------------------------------------
  async forecastSummary(orgId: string): Promise<ForecastSummary> {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: orgId, isActive: true },
    });

    const allAlerts: ReorderAlert[] = [];
    const productGrowthMap = new Map<
      string,
      { productId: string; productName: string; productSku: string; growthRate: number; avgWeeklyConsumption: number }
    >();
    const productDeclineMap = new Map<
      string,
      { productId: string; productName: string; productSku: string; declineRate: number; avgWeeklyConsumption: number }
    >();
    const costByBranch: Array<{ branchId: string; branchName: string; totalCost: number }> = [];

    for (const branch of branches) {
      const branchForecasts = await this.forecastByBranch(orgId, branch.id, 4);
      let branchCost = 0;

      for (const f of branchForecasts) {
        // Reorder alerts: products where stock will run out within 7 days
        if (f.reorderNeeded || (f.daysOfStockLeft !== null && f.daysOfStockLeft < 7)) {
          allAlerts.push({
            productId: f.product.id,
            productName: f.product.name,
            productSku: f.product.sku,
            branchId: branch.id,
            branchName: branch.name,
            currentStock: f.currentStock,
            daysOfStockLeft: f.daysOfStockLeft,
            avgDailyConsumption: f.avgDailyConsumption,
            forecastedWeeklyQuantity: f.forecast[0]?.predictedQuantity ?? 0,
          });
        }

        // Track growth/decline by product
        if (f.historical.length >= 4) {
          const growthRate = this.calculateGrowthRate(f.historical);
          const key = f.product.id;
          if (growthRate > 0.05) {
            const existing = productGrowthMap.get(key);
            if (!existing || growthRate > existing.growthRate) {
              productGrowthMap.set(key, {
                productId: f.product.id,
                productName: f.product.name,
                productSku: f.product.sku,
                growthRate: Math.round(growthRate * 10000) / 100,
                avgWeeklyConsumption: f.avgWeeklyConsumption,
              });
            }
          } else if (growthRate < -0.05) {
            const existing = productDeclineMap.get(key);
            if (!existing || growthRate < existing.declineRate) {
              productDeclineMap.set(key, {
                productId: f.product.id,
                productName: f.product.name,
                productSku: f.product.sku,
                declineRate: Math.round(growthRate * 10000) / 100,
                avgWeeklyConsumption: f.avgWeeklyConsumption,
              });
            }
          }
        }

        // Forecasted cost: sum of 4 weeks forecast * costPerUnit
        const forecastTotal = f.forecast.reduce((s, fw) => s + fw.predictedQuantity, 0);
        branchCost += forecastTotal * f.product.costPerUnit;
      }

      costByBranch.push({
        branchId: branch.id,
        branchName: branch.name,
        totalCost: Math.round(branchCost * 100) / 100,
      });
    }

    // Sort alerts by days of stock (most critical first)
    allAlerts.sort((a, b) => {
      const aDays = a.daysOfStockLeft ?? 999;
      const bDays = b.daysOfStockLeft ?? 999;
      return aDays - bDays;
    });

    return {
      criticalStockBranches: allAlerts.slice(0, 10),
      highestGrowthProducts: Array.from(productGrowthMap.values())
        .sort((a, b) => b.growthRate - a.growthRate)
        .slice(0, 10),
      decliningProducts: Array.from(productDeclineMap.values())
        .sort((a, b) => a.declineRate - b.declineRate)
        .slice(0, 10),
      forecastedCostByBranch: costByBranch.sort((a, b) => b.totalCost - a.totalCost),
      reorderAlerts: allAlerts,
    };
  }

  // ---------------------------------------------------------------------------
  // getSuggestedRequisition — auto-suggest what a store should order
  // ---------------------------------------------------------------------------
  async getSuggestedRequisition(
    orgId: string,
    branchId: string,
  ): Promise<SuggestedRequisitionItem[]> {
    const branchForecasts = await this.forecastByBranch(orgId, branchId, 1);
    const items: SuggestedRequisitionItem[] = [];

    for (const f of branchForecasts) {
      if (f.daysOfStockLeft === null) continue;
      if (f.daysOfStockLeft >= 7) continue;

      const weeklyConsumption = f.forecast[0]?.predictedQuantity ?? f.avgWeeklyConsumption;
      const suggestedQty = Math.max(0, Math.ceil(weeklyConsumption - f.currentStock));
      if (suggestedQty <= 0) continue;

      const urgency: "critical" | "warning" | "normal" =
        f.daysOfStockLeft < 3 ? "critical" : f.daysOfStockLeft < 7 ? "warning" : "normal";

      items.push({
        productId: f.product.id,
        productSku: f.product.sku,
        productName: f.product.name,
        unitOfMeasure: f.product.unitOfMeasure,
        currentStock: f.currentStock,
        forecastedWeeklyConsumption: weeklyConsumption,
        suggestedQuantity: suggestedQty,
        estimatedCost: Math.round(suggestedQty * f.product.costPerUnit * 100) / 100,
        daysOfStockLeft: f.daysOfStockLeft,
        urgency,
      });
    }

    // Sort: critical first, then by suggested quantity desc
    items.sort((a, b) => {
      const urgencyOrder = { critical: 0, warning: 1, normal: 2 };
      const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (diff !== 0) return diff;
      return b.suggestedQuantity - a.suggestedQuantity;
    });

    return items;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getPeriodKey(date: Date, period: Period): string {
    const d = new Date(date);
    if (period === "daily") {
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    if (period === "weekly") {
      return this.getISOWeek(d); // YYYY-Www
    }
    // monthly
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  private getISOWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  private getNextWeekKey(lastWeek: string, offset: number): string {
    // Parse YYYY-Www
    const match = lastWeek.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return `future-W${offset}`;
    let year = parseInt(match[1], 10);
    let week = parseInt(match[2], 10) + offset;

    // Handle year overflow (ISO weeks: typically 52 or 53)
    while (week > 52) {
      week -= 52;
      year++;
    }
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  private getWeights(count: number): number[] {
    // Weights: most recent gets highest weight
    // For 4 items: [1, 2, 3, 4]
    // For 3 items: [1, 2, 3]
    // etc.
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  private calculateTrend(historical: ConsumptionBucket[]): Trend {
    if (historical.length < 4) return "stable";

    const mid = Math.floor(historical.length / 2);
    const firstHalf = historical.slice(0, mid);
    const secondHalf = historical.slice(mid);

    const avgFirst = firstHalf.reduce((s, h) => s + h.quantity, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, h) => s + h.quantity, 0) / secondHalf.length;

    if (avgFirst === 0) return avgSecond > 0 ? "increasing" : "stable";

    const change = (avgSecond - avgFirst) / avgFirst;
    if (change > 0.1) return "increasing";
    if (change < -0.1) return "decreasing";
    return "stable";
  }

  private calculateGrowthRate(historical: ConsumptionBucket[]): number {
    if (historical.length < 4) return 0;
    const mid = Math.floor(historical.length / 2);
    const firstHalf = historical.slice(0, mid);
    const secondHalf = historical.slice(mid);

    const avgFirst = firstHalf.reduce((s, h) => s + h.quantity, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, h) => s + h.quantity, 0) / secondHalf.length;

    if (avgFirst === 0) return avgSecond > 0 ? 1 : 0;
    return (avgSecond - avgFirst) / avgFirst;
  }

  private calculateConfidence(historical: ConsumptionBucket[], weeksAhead: number): number {
    // Confidence decreases with fewer data points and further out forecast
    const dataFactor = Math.min(historical.length / 12, 1); // More data = more confident
    const timeFactor = Math.max(0.5, 1 - weeksAhead * 0.1); // Further out = less confident

    // Variance factor: low variance = high confidence
    const quantities = historical.map((h) => h.quantity);
    const mean = quantities.reduce((s, q) => s + q, 0) / quantities.length;
    const variance =
      quantities.reduce((s, q) => s + Math.pow(q - mean, 2), 0) / quantities.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const varianceFactor = Math.max(0.3, 1 - cv * 0.5);

    return Math.min(0.95, dataFactor * timeFactor * varianceFactor);
  }
}
