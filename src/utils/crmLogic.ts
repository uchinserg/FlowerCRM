// src/utils/crmLogic.ts
import {
  ChannelSource,
  Conversation,
  Customer,
  CustomerSegment,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  RecipeLine,
} from '../types/crm';

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }
  return `+${digits}`;
}

export function formatPhoneDisplay(phone: string): string {
  const norm = normalizePhoneE164(phone);
  const match = norm.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (match) {
    return `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`;
  }
  return phone;
}

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

/**
 * Расчет себестоимости и розничной стоимости одного букета по его рецептуре (цветы, зелень, упаковка)
 */
export function calculateRecipeItemMetrics(params: {
  id: string;
  productId: string | null;
  title: string;
  quantity: number;
  unitPriceOverride?: number;
  catalogRetailPrice?: number;
  recipe: RecipeLine[];
}): OrderItem {
  const unitCostPrice = roundMoney(
    params.recipe.reduce((sum, r) => sum + r.quantityUsed * r.unitCost, 0)
  );

  const retailFromStems = roundMoney(
    params.recipe.reduce((sum, r) => sum + r.quantityUsed * r.unitRetail, 0)
  );

  const unitPrice = roundMoney(
    params.unitPriceOverride !== undefined
      ? params.unitPriceOverride
      : params.catalogRetailPrice !== undefined
      ? params.catalogRetailPrice
      : retailFromStems
  );

  return {
    id: params.id,
    productId: params.productId,
    title: params.title,
    quantity: params.quantity,
    unitPrice,
    unitCostPrice,
    lineTotalPrice: roundMoney(unitPrice * params.quantity),
    lineTotalCost: roundMoney(unitCostPrice * params.quantity),
    recipe: params.recipe,
  };
}

/**
 * Полная финансовая математика заказа:
 * стоимость, себестоимость цветов, скидка (% или ₽), комиссия площадки и чистая прибыль
 */
export function calculateOrderFinancials(params: {
  items: OrderItem[];
  discountPercent: number;
  discountFixedRub?: number;
  deliveryPrice: number;
  courierCostPrice: number;
  source: ChannelSource;
}) {
  const itemsSubtotal = roundMoney(
    params.items.reduce((sum, item) => sum + item.lineTotalPrice, 0)
  );
  const totalCostPrice = roundMoney(
    params.items.reduce((sum, item) => sum + item.lineTotalCost, 0)
  );

  let discountAmount = 0;
  let effectiveDiscountPct = 0;

  if (params.discountFixedRub && params.discountFixedRub > 0) {
    discountAmount = Math.min(itemsSubtotal, roundMoney(params.discountFixedRub));
    effectiveDiscountPct =
      itemsSubtotal > 0 ? roundMoney((discountAmount / itemsSubtotal) * 100) : 0;
  } else if (params.discountPercent > 0) {
    effectiveDiscountPct = Math.min(100, roundMoney(params.discountPercent));
    discountAmount = roundMoney(itemsSubtotal * (effectiveDiscountPct / 100));
  }

  const afterDiscount = Math.max(0, roundMoney(itemsSubtotal - discountAmount));
  const deliveryPrice = roundMoney(params.deliveryPrice || 0);
  const courierCostPrice = roundMoney(params.courierCostPrice || 0);
  const totalPrice = roundMoney(afterDiscount + deliveryPrice);

  // Комиссия маркетплейсов (Flowwow ~14%, Flavary ~12%, эквайринг сайта ~2.5%)
  const feePctBySource: Record<ChannelSource, number> = {
    FLOWWOW: 14,
    FLAVARY: 12,
    WEBSITE: 2.5,
    VK: 0,
    TELEGRAM: 0,
    MAX: 0,
    PHONE_POS: 0,
  };

  const feePct = feePctBySource[params.source] || 0;
  const marketplaceCommission = roundMoney(totalPrice * (feePct / 100));

  const netProfit = roundMoney(
    totalPrice - totalCostPrice - courierCostPrice - marketplaceCommission
  );

  const marginPct = totalPrice > 0 ? roundMoney((netProfit / totalPrice) * 100) : 0;

  return {
    itemsSubtotal,
    totalCostPrice,
    discountPercent: effectiveDiscountPct,
    discountAmount,
    deliveryPrice,
    courierCostPrice,
    marketplaceCommission,
    totalPrice,
    netProfit,
    marginPct,
  };
}

/**
 * Расчет предоплаты, остатка долга (balance_due / debtAmount) и статуса оплаты
 */
export function calculatePaymentBalance(
  totalPrice: number,
  payments: Array<{ amount: number }>
): {
  paidAmount: number;
  debtAmount: number;
  paymentStatus: PaymentStatus;
} {
  const paidAmount = Math.max(
    0,
    roundMoney(payments.reduce((sum, p) => sum + p.amount, 0))
  );
  const debtAmount = Math.max(0, roundMoney(totalPrice - paidAmount));

  let paymentStatus: PaymentStatus = 'UNPAID';
  if (paidAmount <= 0) {
    paymentStatus = 'UNPAID';
  } else if (debtAmount === 0) {
    paymentStatus = 'FULLY_PAID';
  } else {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return { paidAmount, debtAmount, paymentStatus };
}

/**
 * Валидация перевода статуса заказа в Канбане (Quality Gate: запрет выдачи/доставки без Фото готового букета)
 */
export function validateKanbanTransition(
  order: Pick<
    Order,
    | 'orderNumber'
    | 'status'
    | 'requiresPhotoApproval'
    | 'beforeDeliveryPhotoUrl'
    | 'photoApprovalStatus'
  >,
  nextStatus: OrderStatus
): { allowed: boolean; error?: string } {
  const gatedStatuses: OrderStatus[] = [
    'READY_FOR_DELIVERY',
    'IN_DELIVERY',
    'COMPLETED',
  ];

  if (gatedStatuses.includes(nextStatus) && order.requiresPhotoApproval) {
    if (!order.beforeDeliveryPhotoUrl) {
      return {
        allowed: false,
        error: `Контроль качества (${order.orderNumber}): Нельзя перевести заказ в статус «Готов к выдаче / У курьера» без загруженного фото готового букета!`,
      };
    }
    if (order.photoApprovalStatus === 'REVISION_REQUESTED') {
      return {
        allowed: false,
        error: `Контроль качества (${order.orderNumber}): Клиент попросил скорректировать букет по фото. Загрузите новое фото после переделки.`,
      };
    }
  }

  if (nextStatus === 'PHOTO_APPROVAL' && !order.beforeDeliveryPhotoUrl) {
    return {
      allowed: false,
      error: `Заказ ${order.orderNumber}: Сначала загрузите фото готового букета, чтобы отправить его на согласование клиенту.`,
    };
  }

  return { allowed: true };
}

/**
 * Автоматический пересчет LTV, среднего чека, дат, динамического Last Touch и сегмента клиента
 * при сохранении неизменного First Touch (firstContactSource)
 */
export function recalculateCustomerProfileMetrics(
  customer: Customer,
  allCustomerOrders: Order[]
): Customer {
  const validOrders = allCustomerOrders
    .filter((o) => o.customerId === customer.id && o.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const ordersCount = validOrders.length;
  const completedOrdersCount = validOrders.filter((o) => o.status === 'COMPLETED').length;

  const revenueOrders = validOrders.filter(
    (o) => o.status === 'COMPLETED' || o.paidAmount > 0
  );

  const totalSpentLtv = roundMoney(
    revenueOrders.reduce(
      (sum, o) =>
        sum + (o.status === 'COMPLETED' || o.paymentStatus === 'FULLY_PAID' ? o.totalPrice : o.paidAmount),
      0
    )
  );

  const averageCheck =
    revenueOrders.length > 0 ? roundMoney(totalSpentLtv / revenueOrders.length) : 0;

  const lastOrder = validOrders.length > 0 ? validOrders[validOrders.length - 1] : null;
  const lastOrderAt = lastOrder ? lastOrder.createdAt : customer.lastOrderAt;
  const lastOrderSource = lastOrder ? lastOrder.source : customer.lastOrderSource;

  let segment: CustomerSegment = customer.segment;
  if (customer.segment !== 'BLACKLIST' && customer.segment !== 'CORPORATE') {
    if (customer.isVip || totalSpentLtv >= 35000 || (completedOrdersCount >= 3 && averageCheck >= 10000)) {
      segment = 'VIP';
    } else if (completedOrdersCount >= 2) {
      segment = 'REGULAR';
    } else {
      segment = 'NEW';
    }
  }

  return {
    ...customer,
    // firstContactSource и firstContactAt строго неизменны (immutable First Touch)
    firstContactSource: customer.firstContactSource,
    firstContactAt: customer.firstContactAt,
    ordersCount,
    completedOrdersCount,
    totalSpentLtv,
    averageCheck,
    lastOrderAt,
    lastOrderSource,
    segment,
    isVip: customer.isVip || segment === 'VIP',
  };
}

/**
 * Расчет сквозной аналитики и воронки конверсии из обращений (Conversations) в покупки (Orders)
 */
export function computeAnalyticsSummary(params: {
  orders: Order[];
  conversations: Conversation[];
  customers: Customer[];
  branchIdFilter: string;
}) {
  const filteredOrders = params.orders.filter(
    (o) =>
      o.status !== 'CANCELLED' &&
      (params.branchIdFilter === 'ALL' || o.branchId === params.branchIdFilter)
  );

  const filteredConversations = params.conversations.filter(
    (c) => params.branchIdFilter === 'ALL' || c.branchId === params.branchIdFilter
  );

  const revenue = roundMoney(filteredOrders.reduce((s, o) => s + o.totalPrice, 0));
  const totalCostPrice = roundMoney(filteredOrders.reduce((s, o) => s + o.totalCostPrice, 0));
  const courierCostPrice = roundMoney(filteredOrders.reduce((s, o) => s + o.courierCostPrice, 0));
  const marketplaceCommission = roundMoney(
    filteredOrders.reduce((s, o) => s + o.marketplaceCommission, 0)
  );
  const netProfit = roundMoney(filteredOrders.reduce((s, o) => s + o.netProfit, 0));
  const paidAmount = roundMoney(filteredOrders.reduce((s, o) => s + o.paidAmount, 0));
  const debtAmount = roundMoney(filteredOrders.reduce((s, o) => s + o.debtAmount, 0));
  const ordersCount = filteredOrders.length;
  const averageCheck = ordersCount > 0 ? roundMoney(revenue / ordersCount) : 0;
  const grossMarginPct = revenue > 0 ? roundMoney((netProfit / revenue) * 100) : 0;

  // Воронка конверсии по 6 источникам
  const channels: ChannelSource[] = [
    'VK',
    'TELEGRAM',
    'FLOWWOW',
    'FLAVARY',
    'MAX',
    'WEBSITE',
  ];

  const channelFunnel = channels.map((source) => {
    const convs = filteredConversations.filter((c) => c.source === source);
    const chOrders = filteredOrders.filter((o) => o.source === source);
    const paidOrders = chOrders.filter(
      (o) => o.paymentStatus === 'FULLY_PAID' || o.paymentStatus === 'PARTIALLY_PAID' || o.status === 'COMPLETED'
    );
    const chRevenue = roundMoney(chOrders.reduce((s, o) => s + o.totalPrice, 0));
    const chProfit = roundMoney(chOrders.reduce((s, o) => s + o.netProfit, 0));

    const leadsBase = Math.max(convs.length, chOrders.length);
    const conversionToOrderPct =
      leadsBase > 0 ? Math.round((chOrders.length / leadsBase) * 1000) / 10 : 0;
    const conversionToPaidPct =
      leadsBase > 0 ? Math.round((paidOrders.length / leadsBase) * 1000) / 10 : 0;
    const avgResponseSec =
      convs.length > 0
        ? Math.round(
            convs.reduce((s, c) => s + c.firstResponseTimeSec, 0) / convs.length
          )
        : 0;

    return {
      source,
      conversationsCount: convs.length,
      ordersCreatedCount: chOrders.length,
      paidOrdersCount: paidOrders.length,
      conversionToOrderPct,
      conversionToPaidPct,
      avgResponseSec,
      revenue: chRevenue,
      netProfit: chProfit,
      averageCheck: chOrders.length > 0 ? roundMoney(chRevenue / chOrders.length) : 0,
    };
  });

  const totalConversations = filteredConversations.length;
  const overallConversionPct =
    totalConversations > 0
      ? Math.min(100, Math.round((ordersCount / totalConversations) * 1000) / 10)
      : 0;

  return {
    revenue,
    totalCostPrice,
    courierCostPrice,
    marketplaceCommission,
    netProfit,
    grossMarginPct,
    paidAmount,
    debtAmount,
    ordersCount,
    averageCheck,
    totalConversations,
    overallConversionPct,
    channelFunnel,
  };
}

/**
 * Полная матрица прав доступа RBAC для 5 ролей сети цветочных салонов (Этап 7)
 */
export const RBAC_ROLE_MATRIX: Record<
  import('../types/crm').RoleCode,
  import('../types/crm').RbacRolePermissionProfile
> = {
  ADMIN: {
    role: 'ADMIN',
    title: 'Владелец / Админ',
    scopeDescription:
      'Полный доступ ко всем филиалам, закупочной себестоимости, чистой прибыли, экспорту базы в Excel и настройкам шифрования.',
    canAccessAllBranches: true,
    canViewCostAndProfit: true,
    canExportExcelDatabase: true,
    canManageIntegrationsAndBranches: true,
    canAccessChat: true,
    canAccessCustomerDirectory: true,
    canEditOrderDiscounts: true,
    allowedTabs: ['CHAT', 'KANBAN', 'CUSTOMERS', 'ANALYTICS', 'SECURITY_RBAC'],
  },
  DIRECTOR: {
    role: 'DIRECTOR',
    title: 'Управляющий филиалом',
    scopeDescription:
      'Доступ ко всем операциям, себестоимости, прибыли и аналитике строго в рамках своего закрепленного филиала.',
    canAccessAllBranches: false,
    canViewCostAndProfit: true,
    canExportExcelDatabase: true,
    canManageIntegrationsAndBranches: false,
    canAccessChat: true,
    canAccessCustomerDirectory: true,
    canEditOrderDiscounts: true,
    allowedTabs: ['CHAT', 'KANBAN', 'CUSTOMERS', 'ANALYTICS', 'SECURITY_RBAC'],
  },
  MANAGER: {
    role: 'MANAGER',
    title: 'Менеджер продаж',
    scopeDescription:
      'Чаты, карточки клиентов и создание заказов. Без доступа к глобальной аналитике прибыли и без права скачивания всей базы в Excel.',
    canAccessAllBranches: false,
    canViewCostAndProfit: false,
    canExportExcelDatabase: false,
    canManageIntegrationsAndBranches: false,
    canAccessChat: true,
    canAccessCustomerDirectory: true,
    canEditOrderDiscounts: true,
    allowedTabs: ['CHAT', 'KANBAN', 'CUSTOMERS', 'SECURITY_RBAC'],
  },
  FLORIST: {
    role: 'FLORIST',
    title: 'Флорист',
    scopeDescription:
      'Только Канбан сборки букетов, рецептура (стебли/упаковка) и загрузка фото готового букета. Без финансовых сводок.',
    canAccessAllBranches: false,
    canViewCostAndProfit: false,
    canExportExcelDatabase: false,
    canManageIntegrationsAndBranches: false,
    canAccessChat: false,
    canAccessCustomerDirectory: false,
    canEditOrderDiscounts: false,
    allowedTabs: ['KANBAN', 'SECURITY_RBAC'],
  },
  COURIER: {
    role: 'COURIER',
    title: 'Курьер',
    scopeDescription:
      'Только мобильный терминал доставки: адрес, домофон, телефон получателя, интервал и сумма остатка к оплате.',
    canAccessAllBranches: false,
    canViewCostAndProfit: false,
    canExportExcelDatabase: false,
    canManageIntegrationsAndBranches: false,
    canAccessChat: false,
    canAccessCustomerDirectory: false,
    canEditOrderDiscounts: false,
    allowedTabs: ['KANBAN', 'SECURITY_RBAC'],
  },
};

/**
 * Проверка прав доступа сотрудника (RBAC Guard) с учетом филиала (Branch Isolation)
 */
export function evaluateRbacAccess(params: {
  role: import('../types/crm').RoleCode;
  userBranchId: string;
  targetBranchId?: string;
  action:
    | 'VIEW_ALL_BRANCHES'
    | 'VIEW_COST_AND_PROFIT'
    | 'EXPORT_EXCEL_DB'
    | 'MANAGE_INTEGRATIONS'
    | 'ACCESS_CHAT'
    | 'EDIT_DISCOUNT';
}): { allowed: boolean; reason?: string } {
  const profile = RBAC_ROLE_MATRIX[params.role];

  // Проверка изоляции филиалов для всех ролей, кроме ADMIN
  if (
    !profile.canAccessAllBranches &&
    params.targetBranchId &&
    params.targetBranchId !== 'ALL' &&
    params.targetBranchId !== params.userBranchId
  ) {
    return {
      allowed: false,
      reason: `RBAC Branch Isolation: Роль «${profile.title}» имеет доступ только к своему филиалу (${params.userBranchId}).`,
    };
  }

  switch (params.action) {
    case 'VIEW_ALL_BRANCHES':
      return profile.canAccessAllBranches
        ? { allowed: true }
        : {
            allowed: false,
            reason: `Роль «${profile.title}» привязана к своему филиалу.`,
          };
    case 'VIEW_COST_AND_PROFIT':
      return profile.canViewCostAndProfit
        ? { allowed: true }
        : {
            allowed: false,
            reason: `RBAC: Роль «${profile.title}» не имеет доступа к закупочной себестоимости и чистой прибыли.`,
          };
    case 'EXPORT_EXCEL_DB':
      return profile.canExportExcelDatabase
        ? { allowed: true }
        : {
            allowed: false,
            reason: `RBAC Защита базы: Роли «${profile.title}» запрещена выгрузка клиентской базы и финансовых отчетов в Excel.`,
          };
    case 'MANAGE_INTEGRATIONS':
      return profile.canManageIntegrationsAndBranches
        ? { allowed: true }
        : {
            allowed: false,
            reason: `RBAC: Только Владелец/Админ может управлять API-ключами и добавлять филиалы.`,
          };
    case 'ACCESS_CHAT':
      return profile.canAccessChat
        ? { allowed: true }
        : {
            allowed: false,
            reason: `RBAC: Роль «${profile.title}» работает только с операционными карточками заказов.`,
          };
    case 'EDIT_DISCOUNT':
      return profile.canEditOrderDiscounts
        ? { allowed: true }
        : {
            allowed: false,
            reason: `RBAC: Роль «${profile.title}» не может изменять скидку заказа.`,
          };
  }
}

/**
 * Проекция данных заказа для роли Курьер или Флорист (Data Masking):
 * скрывает закупочную себестоимость и чистую прибыль от неавторизованных ролей
 */
export function sanitizeOrderForRole(
  order: Order,
  role: import('../types/crm').RoleCode
): Order {
  const profile = RBAC_ROLE_MATRIX[role];
  if (profile.canViewCostAndProfit) {
    return order;
  }
  return {
    ...order,
    totalCostPrice: 0,
    netProfit: 0,
    marketplaceCommission: 0,
    items: order.items.map((it) => ({
      ...it,
      unitCostPrice: 0,
      lineTotalCost: 0,
    })),
  };
}

