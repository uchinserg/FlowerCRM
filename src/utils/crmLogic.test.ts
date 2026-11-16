// src/utils/crmLogic.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneE164,
  calculateRecipeItemMetrics,
  calculateOrderFinancials,
  calculatePaymentBalance,
  validateKanbanTransition,
  recalculateCustomerProfileMetrics,
  evaluateRbacAccess,
  sanitizeOrderForRole,
} from './crmLogic';
import { Customer, Order } from '../types/crm';

test('normalizePhoneE164 formats Russian 8 and 7 numbers to +7 E.164', () => {
  assert.equal(normalizePhoneE164('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhoneE164('79165554433'), '+79165554433');
  assert.equal(normalizePhoneE164('9261112233'), '+79261112233');
});

test('calculateRecipeItemMetrics & calculateOrderFinancials compute exact cost, discount, fee and netProfit', () => {
  const item = calculateRecipeItemMetrics({
    id: 'item-1',
    productId: 'prod-1',
    title: 'Букет пионовидных роз',
    quantity: 2,
    catalogRetailPrice: 6500,
    recipe: [
      {
        ingredientId: 'ing-1',
        ingredientName: 'Роза пионовидная O Hara',
        quantityUsed: 11,
        unitCost: 180,
        unitRetail: 450,
      },
      {
        ingredientId: 'ing-2',
        ingredientName: 'Эвкалипт Цинерея',
        quantityUsed: 3,
        unitCost: 90,
        unitRetail: 200,
      },
      {
        ingredientId: 'ing-3',
        ingredientName: 'Матовая упаковка + лента',
        quantityUsed: 1,
        unitCost: 150,
        unitRetail: 350,
      },
    ],
  });

  // 1 букет себестоимость: 11*180 (1980) + 3*90 (270) + 150 = 2400 ₽. За 2 шт = 4800 ₽
  assert.equal(item.unitCostPrice, 2400);
  assert.equal(item.lineTotalCost, 4800);
  assert.equal(item.lineTotalPrice, 13000);

  const fin = calculateOrderFinancials({
    items: [item],
    discountPercent: 10, // Скидка 10% = 1300 ₽ -> после скидки 11700 ₽
    deliveryPrice: 500,  // Итого с доставкой = 12200 ₽
    courierCostPrice: 450,
    source: 'TELEGRAM',  // Комиссия 0%
  });

  assert.equal(fin.itemsSubtotal, 13000);
  assert.equal(fin.discountAmount, 1300);
  assert.equal(fin.totalPrice, 12200);
  assert.equal(fin.totalCostPrice, 4800);
  // Чистая прибыль: 12200 - 4800 - 450 = 6950 ₽
  assert.equal(fin.netProfit, 6950);
});

test('calculatePaymentBalance computes prepayment and remaining debt accurately', () => {
  const unpaid = calculatePaymentBalance(8500, []);
  assert.equal(unpaid.paymentStatus, 'UNPAID');
  assert.equal(unpaid.debtAmount, 8500);

  const partial = calculatePaymentBalance(8500, [{ amount: 4000 }]);
  assert.equal(partial.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(partial.paidAmount, 4000);
  assert.equal(partial.debtAmount, 4500);

  const full = calculatePaymentBalance(8500, [{ amount: 4000 }, { amount: 4500 }]);
  assert.equal(full.paymentStatus, 'FULLY_PAID');
  assert.equal(full.debtAmount, 0);
});

test('validateKanbanTransition blocks READY_FOR_DELIVERY without uploaded bouquet photo', () => {
  const blocked = validateKanbanTransition(
    {
      orderNumber: 'FL-ARB-001',
      status: 'IN_ASSEMBLY',
      requiresPhotoApproval: true,
      beforeDeliveryPhotoUrl: undefined,
      photoApprovalStatus: 'NOT_UPLOADED',
    },
    'READY_FOR_DELIVERY'
  );
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.error?.includes('без загруженного фото готового букета'));

  const allowed = validateKanbanTransition(
    {
      orderNumber: 'FL-ARB-001',
      status: 'PHOTO_APPROVAL',
      requiresPhotoApproval: true,
      beforeDeliveryPhotoUrl: '/photo.jpg',
      photoApprovalStatus: 'APPROVED',
    },
    'READY_FOR_DELIVERY'
  );
  assert.equal(allowed.allowed, true);
});

test('recalculateCustomerProfileMetrics updates LTV, averageCheck, lastOrderSource and preserves immutable firstContactSource', () => {
  const baseCustomer: Customer = {
    id: 'cust-1',
    fullName: 'Анна Морозова',
    phone: '+79991112233',
    preferredBranchId: 'br-1',
    assignedManagerId: 'usr-1',
    firstContactAt: '2026-01-10T10:00:00Z',
    firstContactSource: 'VK',
    lastOrderAt: null,
    lastOrderSource: null,
    ordersCount: 0,
    completedOrdersCount: 0,
    totalSpentLtv: 0,
    averageCheck: 0,
    personalDiscountPct: 5,
    segment: 'NEW',
    isVip: false,
    tags: [],
    flowerPreferences: 'Пионы',
    importantDates: [],
    notes: '',
    addresses: [],
  };

  const orders: Order[] = [
    {
      id: 'ord-1',
      orderNumber: 'FL-01',
      branchId: 'br-1',
      source: 'VK',
      customerId: 'cust-1',
      managerUserId: 'usr-1',
      floristUserId: 'usr-2',
      status: 'COMPLETED',
      fulfillmentType: 'DELIVERY',
      readyByAt: '2026-03-08T12:00:00Z',
      deliveryDate: '2026-03-08',
      deliveryWindow: '12:00-14:00',
      isSelfRecipient: false,
      recipientName: 'Мама',
      recipientPhone: '+79990001122',
      deliveryAddress: 'ул. Арбат, 10',
      isSurprise: true,
      isAnonymousSender: false,
      requiresPhotoApproval: true,
      photoApprovalStatus: 'APPROVED',
      items: [],
      itemsSubtotal: 20000,
      discountPercent: 0,
      discountAmount: 0,
      deliveryPrice: 0,
      courierCostPrice: 500,
      marketplaceCommission: 0,
      totalPrice: 20000,
      totalCostPrice: 7000,
      netProfit: 12500,
      paymentStatus: 'FULLY_PAID',
      paidAmount: 20000,
      debtAmount: 0,
      payments: [],
      createdAt: '2026-03-08T09:00:00Z',
    },
    {
      id: 'ord-2',
      orderNumber: 'FL-02',
      branchId: 'br-1',
      source: 'TELEGRAM',
      customerId: 'cust-1',
      managerUserId: 'usr-1',
      floristUserId: 'usr-2',
      status: 'COMPLETED',
      fulfillmentType: 'DELIVERY',
      readyByAt: '2026-11-12T15:00:00Z',
      deliveryDate: '2026-11-12',
      deliveryWindow: '15:00-17:00',
      isSelfRecipient: false,
      recipientName: 'Мама',
      recipientPhone: '+79990001122',
      deliveryAddress: 'ул. Арбат, 10',
      isSurprise: true,
      isAnonymousSender: false,
      requiresPhotoApproval: true,
      photoApprovalStatus: 'APPROVED',
      items: [],
      itemsSubtotal: 18000,
      discountPercent: 0,
      discountAmount: 0,
      deliveryPrice: 0,
      courierCostPrice: 500,
      marketplaceCommission: 0,
      totalPrice: 18000,
      totalCostPrice: 6200,
      netProfit: 11300,
      paymentStatus: 'FULLY_PAID',
      paidAmount: 18000,
      debtAmount: 0,
      payments: [],
      createdAt: '2026-11-12T11:00:00Z',
    },
  ];

  const updated = recalculateCustomerProfileMetrics(baseCustomer, orders);
  assert.equal(updated.firstContactSource, 'VK'); // Неизменяемый First Touch
  assert.equal(updated.lastOrderSource, 'TELEGRAM'); // Динамический Last Touch
  assert.equal(updated.totalSpentLtv, 38000);
  assert.equal(updated.averageCheck, 19000);
  assert.equal(updated.segment, 'VIP'); // LTV >= 35000 -> VIP
});

test('evaluateRbacAccess enforces role matrix, branch isolation, and sanitizeOrderForRole masks cost/profit', () => {
  // 1. ADMIN имеет полный доступ ко всем филиалам и экспорту базы
  assert.equal(
    evaluateRbacAccess({
      role: 'ADMIN',
      userBranchId: 'br-arbat',
      targetBranchId: 'br-nevsky',
      action: 'EXPORT_EXCEL_DB',
    }).allowed,
    true
  );

  // 2. DIRECTOR (Управляющий филиалом) имеет доступ к своему филиалу, но заблокирован для чужого
  assert.equal(
    evaluateRbacAccess({
      role: 'DIRECTOR',
      userBranchId: 'br-arbat',
      targetBranchId: 'br-arbat',
      action: 'VIEW_COST_AND_PROFIT',
    }).allowed,
    true
  );
  assert.equal(
    evaluateRbacAccess({
      role: 'DIRECTOR',
      userBranchId: 'br-arbat',
      targetBranchId: 'br-nevsky',
      action: 'VIEW_COST_AND_PROFIT',
    }).allowed,
    false
  );

  // 3. MANAGER (Менеджер продаж) не имеет права скачивать базу клиентов в Excel и смотреть глобальную прибыль
  assert.equal(
    evaluateRbacAccess({
      role: 'MANAGER',
      userBranchId: 'br-arbat',
      action: 'EXPORT_EXCEL_DB',
    }).allowed,
    false
  );
  assert.equal(
    evaluateRbacAccess({
      role: 'MANAGER',
      userBranchId: 'br-arbat',
      action: 'VIEW_COST_AND_PROFIT',
    }).allowed,
    false
  );

  // 4. FLORIST и COURIER не видят себестоимость и маржу при санитизации заказа
  const sampleOrder = {
    id: 'ord-test',
    totalPrice: 7500,
    totalCostPrice: 2400,
    netProfit: 4650,
    marketplaceCommission: 450,
    debtAmount: 3500,
    items: [
      {
        id: 'it-1',
        productId: 'p-1',
        title: 'Букет',
        quantity: 1,
        unitPrice: 7500,
        unitCostPrice: 2400,
        lineTotalPrice: 7500,
        lineTotalCost: 2400,
        recipe: [],
      },
    ],
  } as unknown as Order;

  const maskedForFlorist = sanitizeOrderForRole(sampleOrder, 'FLORIST');
  assert.equal(maskedForFlorist.totalCostPrice, 0);
  assert.equal(maskedForFlorist.netProfit, 0);
  assert.equal(maskedForFlorist.debtAmount, 3500);
});

