// src/components/OrderFormModal.tsx
import React, { useState, useMemo } from 'react';
import {
  Branch,
  CatalogProduct,
  ChannelSource,
  Customer,
  FulfillmentType,
  Ingredient,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  RecipeLine,
  StaffUser,
} from '../types/crm';
import {
  calculateOrderFinancials,
  calculatePaymentBalance,
  calculateRecipeItemMetrics,
  formatCurrency,
  validateKanbanTransition,
} from '../utils/crmLogic';
import { BOUQUET_IMAGES } from '../data/seedData';
import {
  CHANNEL_META,
  ORDER_STATUS_LABELS,
  ResilientBouquetImage,
} from './ChannelBadge';
import {
  Camera,
  Check,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Truck,
  Store,
} from 'lucide-react';

interface OrderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingOrder?: Order | null;
  prefillCustomer?: Customer | null;
  prefillSource?: ChannelSource;
  prefillConversationId?: string;
  selectedBranchId: string;
  branches: Branch[];
  customers: Customer[];
  staff: StaffUser[];
  catalogProducts: CatalogProduct[];
  ingredients: Ingredient[];
  onSaveOrder: (order: Order, sendPhotoToChat?: boolean) => void;
}

export const OrderFormModal: React.FC<OrderFormModalProps> = ({
  isOpen,
  onClose,
  existingOrder,
  prefillCustomer,
  prefillSource,
  prefillConversationId,
  selectedBranchId,
  branches,
  customers,
  staff,
  catalogProducts,
  ingredients,
  onSaveOrder,
}) => {
  if (!isOpen) return null;

  const initialCustomer =
    existingOrder
      ? customers.find((c) => c.id === existingOrder.customerId) || customers[0]
      : prefillCustomer || customers[0];

  const [customerId, setCustomerId] = useState<string>(initialCustomer.id);
  const activeCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) || customers[0],
    [customers, customerId]
  );

  const [branchId, setBranchId] = useState<string>(
    existingOrder?.branchId ||
      (selectedBranchId !== 'ALL' ? selectedBranchId : activeCustomer.preferredBranchId) ||
      branches[0].id
  );

  const [source, setSource] = useState<ChannelSource>(
    existingOrder?.source || prefillSource || activeCustomer.firstContactSource || 'TELEGRAM'
  );

  const [status, setStatus] = useState<OrderStatus>(
    existingOrder?.status || 'PAID_IN_QUEUE'
  );

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(
    existingOrder?.fulfillmentType || 'DELIVERY'
  );

  const [deliveryDate, setDeliveryDate] = useState<string>(
    existingOrder?.deliveryDate || '2026-11-13'
  );
  const [readyByTime, setReadyByTime] = useState<string>(
    existingOrder
      ? existingOrder.readyByAt.slice(11, 16)
      : '14:30'
  );
  const [deliveryWindow, setDeliveryWindow] = useState<string>(
    existingOrder?.deliveryWindow || '15:00 – 17:00'
  );

  // Получатель и адрес доставки (отдельно от Заказчика)
  const defaultAddr = activeCustomer.addresses[0];
  const [isSelfRecipient, setIsSelfRecipient] = useState<boolean>(
    existingOrder?.isSelfRecipient ?? false
  );
  const [recipientName, setRecipientName] = useState<string>(
    existingOrder?.recipientName || defaultAddr?.recipientName || activeCustomer.fullName
  );
  const [recipientPhone, setRecipientPhone] = useState<string>(
    existingOrder?.recipientPhone || defaultAddr?.recipientPhone || activeCustomer.phone
  );
  const [deliveryAddress, setDeliveryAddress] = useState<string>(
    existingOrder?.deliveryAddress ||
      (defaultAddr
        ? `${defaultAddr.city}, ${defaultAddr.streetAndHouse}${
            defaultAddr.apartmentOffice ? `, ${defaultAddr.apartmentOffice}` : ''
          }`
        : 'Москва, ул. Новый Арбат, 15')
  );
  const [intercomCode, setIntercomCode] = useState<string>(
    existingOrder?.intercomCode || defaultAddr?.intercomCode || ''
  );
  const [isSurprise, setIsSurprise] = useState<boolean>(
    existingOrder?.isSurprise ?? true
  );
  const [isAnonymousSender, setIsAnonymousSender] = useState<boolean>(
    existingOrder?.isAnonymousSender ?? false
  );
  const [greetingCardText, setGreetingCardText] = useState<string>(
    existingOrder?.greetingCardText || ''
  );
  const [internalFloristNote, setInternalFloristNote] = useState<string>(
    existingOrder?.internalFloristNote || ''
  );

  // Ответственные сотрудники
  const managers = staff.filter((s) => s.role === 'MANAGER' || s.role === 'ADMIN');
  const florists = staff.filter((s) => s.role === 'FLORIST');
  const couriers = staff.filter((s) => s.role === 'COURIER');

  const [managerUserId, setManagerUserId] = useState<string>(
    existingOrder?.managerUserId || activeCustomer.assignedManagerId || managers[0]?.id || ''
  );
  const [floristUserId, setFloristUserId] = useState<string>(
    existingOrder?.floristUserId || florists[0]?.id || ''
  );
  const [courierUserId, setCourierUserId] = useState<string>(
    existingOrder?.courierUserId || couriers[0]?.id || ''
  );

  // Состав заказа и рецептура (букеты + поштучные цветы)
  const [items, setItems] = useState<OrderItem[]>(() => {
    if (existingOrder && existingOrder.items.length > 0) {
      return existingOrder.items;
    }
    const firstCatalog = catalogProducts[0];
    return [
      calculateRecipeItemMetrics({
        id: `item-${Date.now()}`,
        productId: firstCatalog.id,
        title: firstCatalog.name,
        quantity: 1,
        catalogRetailPrice: firstCatalog.retailPrice,
        recipe: firstCatalog.defaultRecipe.map((r) => ({ ...r })),
      }),
    ];
  });

  // Финансовые настройки и частичная оплата
  const [discountPercent, setDiscountPercent] = useState<number>(
    existingOrder?.discountPercent ?? activeCustomer.personalDiscountPct ?? 0
  );
  const [deliveryPrice, setDeliveryPrice] = useState<number>(
    existingOrder?.deliveryPrice ?? (fulfillmentType === 'DELIVERY' ? 500 : 0)
  );
  const [courierCostPrice, setCourierCostPrice] = useState<number>(
    existingOrder?.courierCostPrice ?? (fulfillmentType === 'DELIVERY' ? 450 : 0)
  );

  // Предоплата и история оплат
  const [payments, setPayments] = useState(
    existingOrder?.payments || [
      {
        id: `pay-${Date.now()}`,
        amount: 3500,
        paymentMethod: 'SBP_QR' as PaymentMethod,
        isPrepayment: true,
        paidAt: new Date().toISOString(),
        comment: 'Предоплата по СБП',
      },
    ]
  );
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>('SBP_QR');

  // Фото готового букета до доставки
  const [beforeDeliveryPhotoUrl, setBeforeDeliveryPhotoUrl] = useState<string | undefined>(
    existingOrder?.beforeDeliveryPhotoUrl
  );
  const [sendPhotoToChat, setSendPhotoToChat] = useState<boolean>(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Живой пересчет экономики заказа
  const financials = useMemo(
    () =>
      calculateOrderFinancials({
        items,
        discountPercent,
        deliveryPrice: fulfillmentType === 'PICKUP' ? 0 : deliveryPrice,
        courierCostPrice: fulfillmentType === 'PICKUP' ? 0 : courierCostPrice,
        source,
      }),
    [items, discountPercent, deliveryPrice, courierCostPrice, fulfillmentType, source]
  );

  const paymentBalance = useMemo(
    () => calculatePaymentBalance(financials.totalPrice, payments),
    [financials.totalPrice, payments]
  );

  // Обработчики изменения состава букета и рецептуры
  const handleAddCatalogProduct = (productId: string) => {
    const prod = catalogProducts.find((p) => p.id === productId);
    if (!prod) return;
    const newItem = calculateRecipeItemMetrics({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: prod.id,
      title: prod.name,
      quantity: 1,
      catalogRetailPrice: prod.retailPrice,
      recipe: prod.defaultRecipe.map((r) => ({ ...r })),
    });
    setItems((prev) => [...prev, newItem]);
  };

  const handleUpdateStemQuantity = (
    itemIndex: number,
    recipeIndex: number,
    newQty: number
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;
        const updatedRecipe: RecipeLine[] = item.recipe
          .map((line, rIdx) =>
            rIdx === recipeIndex
              ? { ...line, quantityUsed: Math.max(0, newQty) }
              : line
          )
          .filter((line) => line.quantityUsed > 0);

        return calculateRecipeItemMetrics({
          id: item.id,
          productId: item.productId,
          title: item.title,
          quantity: item.quantity,
          unitPriceOverride: item.unitPrice,
          recipe: updatedRecipe,
        });
      })
    );
  };

  const handleAddIngredientToItem = (itemIndex: number, ingredientId: string) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;
        const existingIdx = item.recipe.findIndex((r) => r.ingredientId === ing.id);
        let updatedRecipe: RecipeLine[];
        if (existingIdx >= 0) {
          updatedRecipe = item.recipe.map((r, i) =>
            i === existingIdx ? { ...r, quantityUsed: r.quantityUsed + 1 } : r
          );
        } else {
          updatedRecipe = [
            ...item.recipe,
            {
              ingredientId: ing.id,
              ingredientName: ing.name,
              quantityUsed: 3,
              unitCost: ing.purchaseCostPrice,
              unitRetail: ing.retailUnitPrice,
            },
          ];
        }
        return calculateRecipeItemMetrics({
          id: item.id,
          productId: item.productId,
          title: item.title,
          quantity: item.quantity,
          recipe: updatedRecipe,
        });
      })
    );
  };

  const handleAddPayment = () => {
    const num = parseFloat(newPaymentAmount);
    if (isNaN(num) || num <= 0) return;
    setPayments((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}`,
        amount: num,
        paymentMethod: newPaymentMethod,
        isPrepayment: paymentBalance.paidAmount === 0,
        paidAt: new Date().toISOString(),
        comment:
          paymentBalance.paidAmount === 0
            ? 'Предоплата клиента'
            : 'Доплата остатка долга',
      },
    ]);
    setNewPaymentAmount('');
  };

  const handlePayRemainingDebt = () => {
    if (paymentBalance.debtAmount <= 0) return;
    setPayments((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}`,
        amount: paymentBalance.debtAmount,
        paymentMethod: newPaymentMethod,
        isPrepayment: false,
        paidAt: new Date().toISOString(),
        comment: 'Полное погашение остатка долга',
      },
    ]);
  };

  const handleCustomerAddressSelect = (addressId: string) => {
    const found = activeCustomer.addresses.find((a) => a.id === addressId);
    if (!found) return;
    setIsSelfRecipient(false);
    setRecipientName(found.recipientName);
    setRecipientPhone(found.recipientPhone);
    setDeliveryAddress(
      `${found.city}, ${found.streetAndHouse}${
        found.apartmentOffice ? `, ${found.apartmentOffice}` : ''
      }`
    );
    setIntercomCode(found.intercomCode || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (items.length === 0) {
      setValidationError('Добавьте хотя бы один букет или цветок в состав заказа.');
      return;
    }

    const tempOrderNumber =
      existingOrder?.orderNumber ||
      `FL-MSK-${Math.floor(1000 + Math.random() * 9000)}`;

    const transitionCheck = validateKanbanTransition(
      {
        orderNumber: tempOrderNumber,
        status: existingOrder?.status || 'NEW',
        requiresPhotoApproval: true,
        beforeDeliveryPhotoUrl,
        photoApprovalStatus: beforeDeliveryPhotoUrl ? 'APPROVED' : 'NOT_UPLOADED',
      },
      status
    );

    if (!transitionCheck.allowed) {
      setValidationError(transitionCheck.error || 'Ошибка контроля качества');
      return;
    }

    const savedOrder: Order = {
      id: existingOrder?.id || `ord-${Date.now()}`,
      orderNumber: tempOrderNumber,
      externalOrderId: existingOrder?.externalOrderId,
      branchId,
      source,
      conversationId: existingOrder?.conversationId || prefillConversationId,
      customerId: activeCustomer.id,
      managerUserId,
      floristUserId,
      courierUserId,
      status,
      fulfillmentType,
      readyByAt: `${deliveryDate}T${readyByTime}:00Z`,
      deliveryDate,
      deliveryWindow:
        fulfillmentType === 'PICKUP' ? `Самовывоз к ${readyByTime}` : deliveryWindow,
      isSelfRecipient,
      recipientName: isSelfRecipient ? activeCustomer.fullName : recipientName,
      recipientPhone: isSelfRecipient ? activeCustomer.phone : recipientPhone,
      deliveryAddress:
        fulfillmentType === 'PICKUP'
          ? `Самовывоз из филиала (${
              branches.find((b) => b.id === branchId)?.name || ''
            })`
          : deliveryAddress,
      intercomCode,
      isSurprise,
      isAnonymousSender,
      greetingCardText,
      internalFloristNote,
      requiresPhotoApproval: true,
      photoApprovalStatus: beforeDeliveryPhotoUrl
        ? existingOrder?.photoApprovalStatus === 'APPROVED'
          ? 'APPROVED'
          : 'PENDING_APPROVAL'
        : 'NOT_UPLOADED',
      beforeDeliveryPhotoUrl,
      items,
      itemsSubtotal: financials.itemsSubtotal,
      discountPercent: financials.discountPercent,
      discountAmount: financials.discountAmount,
      deliveryPrice: financials.deliveryPrice,
      courierCostPrice: financials.courierCostPrice,
      marketplaceCommission: financials.marketplaceCommission,
      totalPrice: financials.totalPrice,
      totalCostPrice: financials.totalCostPrice,
      netProfit: financials.netProfit,
      paymentStatus: paymentBalance.paymentStatus,
      paidAmount: paymentBalance.paidAmount,
      debtAmount: paymentBalance.debtAmount,
      payments,
      createdAt: existingOrder?.createdAt || new Date().toISOString(),
    };

    onSaveOrder(savedOrder, Boolean(beforeDeliveryPhotoUrl && sendPhotoToChat));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={existingOrder ? `Заказ ${existingOrder.orderNumber}` : 'Создание заказа'}
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {existingOrder
                ? `Карточка заказа ${existingOrder.orderNumber}`
                : 'Оформление нового заказа'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Заказчик: {activeCustomer.fullName} ({activeCustomer.phone}) · Канал:{' '}
              {CHANNEL_META[source].label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно заказа"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тело формы */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {validationError && (
            <div
              role="alert"
              className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ограничение контроля качества</p>
                <p className="mt-0.5">{validationError}</p>
              </div>
            </div>
          )}

          {/* Секция 1: Заказчик, Филиал, Статус Канбана и Тайминг готовности */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-6 border-b border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Заказчик (Кто платит)
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Филиал сборки
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Источник заказа
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as ChannelSource)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Object.entries(CHANNEL_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Статус заказа (Канбан)
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                aria-label="Статус заказа (Канбан)"
                className="w-full px-3 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Object.entries(ORDER_STATUS_LABELS).map(([st, label]) => (
                  <option key={st} value={st}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Секция 2: Рецептура букета, калькулятор себестоимости и розничной стоимости */}
          <div className="space-y-4 pb-6 border-b border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  01. Состав заказа и поштучная рецептура букета
                </h3>
                <p className="text-xs text-slate-500">
                  Списание цветов со склада филиала и автоматический расчет себестоимости в реальном времени
                </p>
              </div>
              <div className="flex items-center gap-2">
                {catalogProducts.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleAddCatalogProduct(prod.id)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    + {prod.name.split('«')[1]?.split('»')[0] || prod.sku}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {items.map((item, itemIdx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItems((prev) =>
                            prev.map((it, i) => (i === itemIdx ? { ...it, title: val } : it))
                          );
                        }}
                        className="w-full px-3 py-1.5 text-sm font-medium bg-white border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div className="flex items-center gap-4 text-xs tabular-nums">
                      <div>
                        <span className="text-slate-500">Кол-во: </span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === itemIdx
                                  ? calculateRecipeItemMetrics({
                                      id: it.id,
                                      productId: it.productId,
                                      title: it.title,
                                      quantity: qty,
                                      unitPriceOverride: it.unitPrice,
                                      recipe: it.recipe,
                                    })
                                  : it
                              )
                            );
                          }}
                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-center font-mono-tabular"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500">Себестоимость: </span>
                        <span className="font-mono-tabular font-semibold text-slate-800">
                          {formatCurrency(item.lineTotalCost)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Цена продажи: </span>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) => {
                            const price = Math.max(0, parseFloat(e.target.value) || 0);
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === itemIdx
                                  ? calculateRecipeItemMetrics({
                                      id: it.id,
                                      productId: it.productId,
                                      title: it.title,
                                      quantity: it.quantity,
                                      unitPriceOverride: price,
                                      recipe: it.recipe,
                                    })
                                  : it
                              )
                            );
                          }}
                          className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-right font-mono-tabular font-semibold text-slate-900"
                        />
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => prev.filter((_, i) => i !== itemIdx))
                          }
                          aria-label="Удалить букет из заказа"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Таблица стеблей и упаковки внутри букета */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-t border-slate-200 pt-2">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="py-1.5 font-medium">Цветок / Зелень / Упаковка</th>
                          <th className="py-1.5 font-medium text-right">Закупка за ед.</th>
                          <th className="py-1.5 font-medium text-center">Кол-во стеблей</th>
                          <th className="py-1.5 font-medium text-right">Сумма себестоимости</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {item.recipe.map((rLine, rIdx) => (
                          <tr key={rLine.ingredientId}>
                            <td className="py-1.5 text-slate-800">{rLine.ingredientName}</td>
                            <td className="py-1.5 text-right font-mono-tabular text-slate-600">
                              {formatCurrency(rLine.unitCost)}
                            </td>
                            <td className="py-1.5 text-center">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={rLine.quantityUsed}
                                onChange={(e) =>
                                  handleUpdateStemQuantity(
                                    itemIdx,
                                    rIdx,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-16 px-1.5 py-0.5 text-center bg-white border border-slate-300 rounded font-mono-tabular"
                              />
                            </td>
                            <td className="py-1.5 text-right font-mono-tabular font-medium text-slate-800">
                              {formatCurrency(rLine.quantityUsed * rLine.unitCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddIngredientToItem(itemIdx, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
                    >
                      <option value="" disabled>
                        + Добавить цветок или упаковку в рецептуру...
                      </option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} (себест. {ing.purchaseCostPrice} ₽/{ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Секция 3: Доставка / Самовывоз и Разделение Заказчик vs Получатель */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  02. Способ получения и Получатель букета
                </h3>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('DELIVERY')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      fulfillmentType === 'DELIVERY'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Доставка курьером
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('PICKUP')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      fulfillmentType === 'PICKUP'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    Самовывоз
                  </button>
                </div>
              </div>

              {activeCustomer.addresses.length > 0 && fulfillmentType === 'DELIVERY' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Быстрый выбор из сохраненных адресов клиента:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeCustomer.addresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => handleCustomerAddressSelect(addr.id)}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors"
                      >
                        {addr.label}: {addr.recipientName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Имя получателя (Кому вручаем)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Телефон получателя
                  </label>
                  <input
                    type="text"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              {fulfillmentType === 'DELIVERY' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Точный адрес доставки
                    </label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Домофон / Охрана
                    </label>
                    <input
                      type="text"
                      value={intercomCode}
                      onChange={(e) => setIntercomCode(e.target.value)}
                      placeholder="Код или пропуск"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Дата доставки
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Готовность букета к
                  </label>
                  <input
                    type="time"
                    value={readyByTime}
                    onChange={(e) => setReadyByTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Интервал доставки
                  </label>
                  <input
                    type="text"
                    value={deliveryWindow}
                    onChange={(e) => setDeliveryWindow(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSurprise}
                    onChange={(e) => setIsSurprise(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Сюрприз (не говорить, что цветы)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymousSender}
                    onChange={(e) => setIsAnonymousSender(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Анонимный отправитель</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Текст открытки к букету
                </label>
                <textarea
                  rows={2}
                  value={greetingCardText}
                  onChange={(e) => setGreetingCardText(e.target.value)}
                  placeholder="Напишите теплые слова для открытки..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Правая половина секции 3: Контроль качества «Фото готового букета» и Ответственные */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                03. Фото готового букета до доставки и Ответственные
              </h3>

              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Статус фотоконтроля:{' '}
                    <strong className="text-slate-900">
                      {beforeDeliveryPhotoUrl ? 'Фото загружено' : 'Ожидает загрузки флористом'}
                    </strong>
                  </span>
                </div>

                {beforeDeliveryPhotoUrl ? (
                  <div className="space-y-2">
                    <ResilientBouquetImage
                      src={beforeDeliveryPhotoUrl}
                      alt="Фото готового букета перед доставкой"
                      className="w-full h-40 object-cover rounded-lg border border-slate-200"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sendPhotoToChat}
                          onChange={(e) => setSendPhotoToChat(e.target.checked)}
                        />
                        <span>Автоматически отправить фото в чат клиенту</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setBeforeDeliveryPhotoUrl(undefined)}
                        className="text-red-600 hover:underline"
                      >
                        Удалить фото
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Без загруженного фото готового букета система заблокирует перевод заказа в статус «Готов к выдаче/доставке».
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBeforeDeliveryPhotoUrl(BOUQUET_IMAGES.PINK_PEONY)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Загрузить фото (Пионовидные розы)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBeforeDeliveryPhotoUrl(BOUQUET_IMAGES.HYDRANGEA_CLOUD)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Фото (Гортензии)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBeforeDeliveryPhotoUrl(BOUQUET_IMAGES.RED_EXPLORER_BOX)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Фото (Коробка Explorer)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ответственный менеджер
                  </label>
                  <select
                    value={managerUserId}
                    onChange={(e) => setManagerUserId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Флорист на сборке
                  </label>
                  <select
                    value={floristUserId}
                    onChange={(e) => setFloristUserId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    {florists.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Курьер
                  </label>
                  <select
                    value={courierUserId}
                    onChange={(e) => setCourierUserId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Технический комментарий для флориста
                </label>
                <input
                  type="text"
                  value={internalFloristNote}
                  onChange={(e) => setInternalFloristNote(e.target.value)}
                  placeholder="Пожелания к сборке, упаковке, высоте стеблей..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Секция 4: Финансовый блок (Скидка, Себестоимость, Чистая прибыль, Предоплата и Остаток долга) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                04. Частичная оплата (Предоплата и остаток долга)
              </h3>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(p.amount)}
                      </span>
                      <span className="text-slate-500"> · {p.paymentMethod} · {p.comment}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPayments((prev) => prev.filter((item) => item.id !== p.id))
                      }
                      className="text-slate-400 hover:text-red-600"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="number"
                  placeholder="Сумма оплаты, ₽"
                  value={newPaymentAmount}
                  onChange={(e) => setNewPaymentAmount(e.target.value)}
                  className="w-36 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-tabular"
                />
                <select
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value as PaymentMethod)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="SBP_QR">СБП / QR-ссылка</option>
                  <option value="CARD_ONLINE">Картой онлайн</option>
                  <option value="POS_TERMINAL">Терминал</option>
                  <option value="CASH">Наличные</option>
                  <option value="MARKETPLACE_BALANCE">Баланс Flowwow/Flavary</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddPayment}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Внести платеж
                </button>
                {paymentBalance.debtAmount > 0 && (
                  <button
                    type="button"
                    onClick={handlePayRemainingDebt}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors"
                  >
                    Погасить остаток ({formatCurrency(paymentBalance.debtAmount)})
                  </button>
                )}
              </div>
            </div>

            {/* Итоговая калькуляция экономики заказа */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs tabular-nums">
              <div className="grid grid-cols-3 gap-3 pb-2 border-b border-slate-200">
                <div>
                  <label className="block text-slate-600 mb-1">Скидка (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPercent}
                    onChange={(e) =>
                      setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                    }
                    className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Доставка клиенту (₽)</label>
                  <input
                    type="number"
                    min={0}
                    value={deliveryPrice}
                    onChange={(e) => setDeliveryPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Тариф курьера (₽)</label>
                  <input
                    type="number"
                    min={0}
                    value={courierCostPrice}
                    onChange={(e) =>
                      setCourierCostPrice(Math.max(0, parseFloat(e.target.value) || 0))
                    }
                    className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>Стоимость букетов по каталогу:</span>
                <span className="font-mono-tabular">{formatCurrency(financials.itemsSubtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Скидка ({financials.discountPercent}%):</span>
                <span className="font-mono-tabular text-rose-700">
                  −{formatCurrency(financials.discountAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Себестоимость цветов и упаковки:</span>
                <span className="font-mono-tabular">{formatCurrency(financials.totalCostPrice)}</span>
              </div>
              {financials.marketplaceCommission > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Комиссия площадки ({CHANNEL_META[source].shortLabel}):</span>
                  <span className="font-mono-tabular">
                    −{formatCurrency(financials.marketplaceCommission)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>Итого к оплате клиентом:</span>
                <span className="font-mono-tabular">{formatCurrency(financials.totalPrice)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Внесено предоплаты / оплаты:</span>
                <span className="font-mono-tabular text-emerald-700 font-semibold">
                  {formatCurrency(paymentBalance.paidAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-semibold">
                <span>Остаток долга к доплате:</span>
                <span
                  className={`font-mono-tabular ${
                    paymentBalance.debtAmount > 0 ? 'text-amber-700' : 'text-slate-500'
                  }`}
                >
                  {formatCurrency(paymentBalance.debtAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-semibold pt-1 border-t border-slate-200">
                <span>Чистая маржинальная прибыль заказа:</span>
                <span className="font-mono-tabular text-emerald-700">
                  {formatCurrency(financials.netProfit)} ({financials.marginPct}%)
                </span>
              </div>
            </div>
          </div>

          {/* Футер модального окна */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Check className="w-4 h-4" />
              {existingOrder ? 'Сохранить изменения заказа' : 'Создать заказ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
