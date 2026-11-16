/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_BRANCHES,
  INITIAL_CATALOG_PRODUCTS,
  INITIAL_CONVERSATIONS,
  INITIAL_CUSTOMERS,
  INITIAL_ENCRYPTED_CHANNEL_VAULT,
  INITIAL_INGREDIENTS,
  INITIAL_ORDERS,
  INITIAL_STAFF,
} from './data/seedData';
import {
  AuditLogEntry,
  Branch,
  ChannelSource,
  Conversation,
  Customer,
  EncryptedChannelVaultItem,
  Order,
  OrderStatus,
  RoleCode,
} from './types/crm';
import {
  RBAC_ROLE_MATRIX,
  recalculateCustomerProfileMetrics,
  formatCurrency,
  sanitizeOrderForRole,
} from './utils/crmLogic';
import { OmnichannelChatView } from './components/OmnichannelChatView';
import { OrdersKanbanView } from './components/OrdersKanbanView';
import {
  AnalyticsDashboardView,
  CustomersDirectoryView,
} from './components/AnalyticsAndCustomersView';
import { SecurityRbacView } from './components/SecurityRbacView';
import { OrderFormModal } from './components/OrderFormModal';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronUp,
  Filter,
  Kanban,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';

import wallpaperUrl from './assets/images/grass_bokeh_wallpaper_1794740508592.jpg';

type ActiveModuleTab = 'CHAT' | 'KANBAN' | 'CUSTOMERS' | 'ANALYTICS' | 'SECURITY_RBAC';

const WALLPAPER_URL = wallpaperUrl;

const TAB_TITLES: Record<ActiveModuleTab, string> = {
  KANBAN: 'Канбан заказов',
  CHAT: 'Омниканальный чат',
  CUSTOMERS: 'Клиенты и сегменты',
  ANALYTICS: 'Аналитика и Excel',
  SECURITY_RBAC: 'Безопасность и RBAC',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveModuleTab>('KANBAN');
  const [currentRole, setCurrentRole] = useState<RoleCode>('ADMIN');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');

  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [staff] = useState(INITIAL_STAFF);
  const [catalogProducts] = useState(INITIAL_CATALOG_PRODUCTS);
  const [ingredients] = useState(INITIAL_INGREDIENTS);

  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [conversations, setConversations] = useState<Conversation[]>(
    INITIAL_CONVERSATIONS
  );
  const [vaultItems, setVaultItems] = useState<EncryptedChannelVaultItem[]>(
    INITIAL_ENCRYPTED_CHANNEL_VAULT
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  const [activeConversationId, setActiveConversationId] = useState<string>(
    INITIAL_CONVERSATIONS[0].id
  );

  // Состояние модального окна заказа (создание из чата / вручную / редактирование)
  const [orderModalOpen, setOrderModalOpen] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [prefillOrderCustomer, setPrefillOrderCustomer] = useState<Customer | null>(null);
  const [prefillOrderSource, setPrefillOrderSource] = useState<ChannelSource | undefined>(
    undefined
  );
  const [prefillConversationId, setPrefillConversationId] = useState<string | undefined>(
    undefined
  );

  // Глобальный быстрый поиск клиента (Ctrl+K) и Карточка клиента
  const [globalSearchOpen, setGlobalSearchOpen] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [selectedCustomerProfile, setSelectedCustomerProfile] =
    useState<Customer | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);

  const activeRoleProfile = RBAC_ROLE_MATRIX[currentRole];

  // При смене роли автоматически изолируем филиал, если роль не имеет доступа ко всем филиалам
  const handleSelectRole = (nextRole: RoleCode) => {
    setCurrentRole(nextRole);
    const nextProf = RBAC_ROLE_MATRIX[nextRole];
    if (!nextProf.canAccessAllBranches && selectedBranchId === 'ALL') {
      setSelectedBranchId('br-arbat');
    }
    if (!nextProf.allowedTabs.includes(activeTab)) {
      setActiveTab('SECURITY_RBAC');
    }
  };

  // Запись события в неизменяемый журнал аудита (Audit Log)
  const appendAuditLog = (
    entry: Omit<
      AuditLogEntry,
      'id' | 'timestamp' | 'actorUserId' | 'actorName' | 'actorRole' | 'ipAddress'
    >
  ) => {
    const actorByRole: Record<RoleCode, { id: string; name: string }> = {
      ADMIN: { id: 'usr-dir-1', name: 'Сергей Ухин (Владелец сети)' },
      DIRECTOR: { id: 'usr-branch-dir-1', name: 'Ольга Романова (Управляющий Арбат)' },
      MANAGER: { id: 'usr-mgr-1', name: 'Екатерина Волкова' },
      FLORIST: { id: 'usr-flr-1', name: 'Мария Белова (Шеф-флорист)' },
      COURIER: { id: 'usr-cur-1', name: 'Игорь Громов (Автокурьер)' },
    };
    const actor = actorByRole[currentRole];
    const newLog: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: currentRole,
      ipAddress: '10.24.1.15',
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Горячая клавиша Ctrl+K / Cmd+K для глобального поиска клиента
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalUnreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  // Проекция заказов с учетом RBAC (скрытие себестоимости и маржи для Флориста и Курьера)
  const visibleOrders = useMemo(
    () => orders.map((o) => sanitizeOrderForRole(o, currentRole)),
    [orders, currentRole]
  );

  const globalSearchResults = useMemo(() => {
    if (!globalSearchQuery.trim()) return customers.slice(0, 5);
    const q = globalSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.addresses.some(
          (a) =>
            a.streetAndHouse.toLowerCase().includes(q) ||
            a.recipientName.toLowerCase().includes(q)
        )
    );
  }, [customers, globalSearchQuery]);

  // Отправка сообщения в омниканальном чате
  const handleSendMessage = (
    conversationId: string,
    textContent: string,
    attachmentUrl?: string
  ) => {
    const nowIso = new Date().toISOString();
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== conversationId) return conv;
        const newMsg = {
          id: `msg-${Date.now()}`,
          conversationId,
          direction: 'OUTBOUND' as const,
          senderName: 'Екатерина Волкова (Менеджер)',
          textContent,
          sentAt: nowIso,
          isRead: true,
          attachmentUrl,
          attachmentType: attachmentUrl
            ? ('BOUQUET_APPROVAL_CARD' as const)
            : undefined,
        };
        return {
          ...conv,
          unreadCount: 0,
          lastMessagePreview: textContent,
          lastMessageAt: nowIso,
          messages: [...conv.messages, newMsg],
        };
      })
    );
  };

  // Сохранение / обновление заказа + автоматический пересчет метрик клиента + Audit Log
  const handleSaveOrder = (savedOrder: Order, sendPhotoToChat?: boolean) => {
    const prevOrder = orders.find((o) => o.id === savedOrder.id);
    if (prevOrder && prevOrder.discountAmount !== savedOrder.discountAmount) {
      appendAuditLog({
        branchId: savedOrder.branchId,
        action: 'ORDER_DISCOUNT_CHANGED',
        entityType: 'ORDER',
        entityId: savedOrder.orderNumber,
        summary: 'Изменена скидка по заказу при редактировании карточки',
        previousValue: `${prevOrder.discountPercent}% (${formatCurrency(
          prevOrder.discountAmount
        )})`,
        newValue: `${savedOrder.discountPercent}% (${formatCurrency(
          savedOrder.discountAmount
        )})`,
      });
    }

    setOrders((prev) => {
      const exists = prev.some((o) => o.id === savedOrder.id);
      const updatedOrders = exists
        ? prev.map((o) => (o.id === savedOrder.id ? savedOrder : o))
        : [savedOrder, ...prev];

      // Немедленно пересчитываем финансовые метрики клиента
      setCustomers((prevCusts) =>
        prevCusts.map((c) =>
          c.id === savedOrder.customerId
            ? recalculateCustomerProfileMetrics(c, updatedOrders)
            : c
        )
      );

      return updatedOrders;
    });

    if (savedOrder.conversationId) {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === savedOrder.conversationId
            ? {
                ...conv,
                linkedOrderId: savedOrder.id,
                lastMessagePreview:
                  sendPhotoToChat && savedOrder.beforeDeliveryPhotoUrl
                    ? `Отправлено фото букета по заказу ${savedOrder.orderNumber}`
                    : `Оформлен заказ ${savedOrder.orderNumber} на ${formatCurrency(
                        savedOrder.totalPrice
                      )}`,
              }
            : conv
        )
      );

      if (sendPhotoToChat && savedOrder.beforeDeliveryPhotoUrl) {
        handleSendMessage(
          savedOrder.conversationId,
          `По заказу ${savedOrder.orderNumber} загружено фото готового букета на согласование!`,
          savedOrder.beforeDeliveryPhotoUrl
        );
      }
    }

    setOrderModalOpen(false);
    setEditingOrder(null);
  };

  // Перевод статуса заказа в Канбане + Audit Log
  const handleMoveOrderStatus = (orderId: string, nextStatus: OrderStatus) => {
    const existing = orders.find((o) => o.id === orderId);
    if (existing && existing.status !== nextStatus) {
      appendAuditLog({
        branchId: existing.branchId,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: existing.orderNumber,
        summary: 'Изменен операционный статус заказа на Канбан-доске',
        previousValue: existing.status,
        newValue: nextStatus,
      });
    }

    setOrders((prev) => {
      const updatedOrders = prev.map((o) =>
        o.id === orderId ? { ...o, status: nextStatus } : o
      );
      const targetOrder = updatedOrders.find((o) => o.id === orderId);
      if (targetOrder) {
        setCustomers((prevCusts) =>
          prevCusts.map((c) =>
            c.id === targetOrder.customerId
              ? recalculateCustomerProfileMetrics(c, updatedOrders)
              : c
          )
        );
      }
      return updatedOrders;
    });
  };

  // Быстрая загрузка фото готового букета флористом прямо с карточки Канбана
  const handleQuickUploadBouquetPhoto = (orderId: string, photoUrl: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              beforeDeliveryPhotoUrl: photoUrl,
              photoApprovalStatus: 'APPROVED',
              status: o.status === 'IN_ASSEMBLY' ? 'PHOTO_APPROVAL' : o.status,
            }
          : o
      )
    );
  };

  // Объединение (Merge) двух карточек клиентов + Audit Log
  const handleMergeCustomers = (targetId: string, sourceId: string) => {
    const target = customers.find((c) => c.id === targetId);
    const source = customers.find((c) => c.id === sourceId);
    if (!target || !source) return;

    appendAuditLog({
      branchId: target.preferredBranchId,
      action: 'CUSTOMER_MERGED',
      entityType: 'CUSTOMER',
      entityId: target.id,
      summary: `Слияние дубликата клиента «${source.fullName}» в карточку «${target.fullName}»`,
      previousValue: `${source.phone} (LTV ${formatCurrency(source.totalSpentLtv)})`,
      newValue: `${target.phone} (Объединенный профиль)`,
    });

    const updatedOrders = orders.map((o) =>
      o.customerId === sourceId ? { ...o, customerId: targetId } : o
    );
    setOrders(updatedOrders);

    setConversations((prev) =>
      prev.map((conv) =>
        conv.customerId === sourceId ? { ...conv, customerId: targetId } : conv
      )
    );

    const earliestIsSource =
      new Date(source.firstContactAt).getTime() <
      new Date(target.firstContactAt).getTime();

    const mergedCustomerBase: Customer = {
      ...target,
      firstContactAt: earliestIsSource ? source.firstContactAt : target.firstContactAt,
      firstContactSource: earliestIsSource
        ? source.firstContactSource
        : target.firstContactSource,
      addresses: [...target.addresses, ...source.addresses],
      tags: Array.from(new Set([...target.tags, ...source.tags])),
    };

    const recalculated = recalculateCustomerProfileMetrics(
      mergedCustomerBase,
      updatedOrders
    );

    setCustomers((prev) =>
      prev.filter((c) => c.id !== sourceId).map((c) => (c.id === targetId ? recalculated : c))
    );
  };

  // Ротация ключа шифрования AES-256-GCM для канала
  const handleRotateVaultKey = (vaultId: string) => {
    const target = vaultItems.find((v) => v.id === vaultId);
    if (!target) return;
    const nextVersion = target.keyVersion + 1;
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16);

    setVaultItems((prev) =>
      prev.map((v) =>
        v.id === vaultId
          ? {
              ...v,
              keyVersion: nextVersion,
              ivHexPreview: `${randomHex}c901...e41a`,
              status: 'ACTIVE',
              lastRotatedAt: new Date().toISOString(),
            }
          : v
      )
    );

    appendAuditLog({
      branchId: target.branchId,
      action: 'CHANNEL_TOKEN_ROTATED',
      entityType: 'INTEGRATION',
      entityId: target.id,
      summary: `Перешифрован API-токен канала ${target.label} (AES-256-GCM)`,
      previousValue: `keyVersion=v${target.keyVersion}`,
      newValue: `keyVersion=v${nextVersion}`,
    });
  };

  // Добавление нового филиала сети (масштабирование)
  const handleAddBranch = (newBranch: Branch) => {
    setBranches((prev) => [...prev, newBranch]);
    appendAuditLog({
      branchId: newBranch.id,
      action: 'BRANCH_CREATED',
      entityType: 'BRANCH',
      entityId: newBranch.code,
      summary: `Подключен новый филиал сети: ${newBranch.city} — ${newBranch.name}`,
      previousValue: `Филиалов: ${branches.length}`,
      newValue: `Филиалов: ${branches.length + 1}`,
    });
  };

  const openQuickOrderModal = () => {
    setEditingOrder(null);
    setPrefillOrderCustomer(customers[0]);
    setPrefillOrderSource('PHONE_POS');
    setPrefillConversationId(undefined);
    setOrderModalOpen(true);
  };

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row text-slate-900 bg-cover bg-center bg-fixed relative"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(12, 32, 20, 0.56) 0%, rgba(18, 45, 26, 0.42) 50%, rgba(10, 26, 16, 0.64) 100%), url(${WALLPAPER_URL})`,
      }}
    >
      {/* АДАПТИВНЫЙ DESKTOP SIDEBAR В СТИЛЕ BITRIX24 (Полупрозрачное темное стекло, 240px) */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-black/40 backdrop-blur-md text-white border-r border-white/15 z-30">
        {/* Верхний логотип в стиле Битрикс24, но с нашим названием FlowerCRM */}
        <div className="h-14 px-4 flex items-center gap-3">
          <Menu className="w-5 h-5 text-white/80 shrink-0" />
          <div className="text-lg font-bold tracking-tight whitespace-nowrap flex items-center">
            <span className="text-white">Flower</span>
            <span className="text-[#2fc6f6] ml-0.5">CRM</span>
          </div>
        </div>

        {/* Стеклянный контейнер меню */}
        <div className="mx-2 my-1 flex-1 rounded-2xl bg-black/30 border border-white/10 flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between text-[11px] font-semibold text-white/60">
            <span>Совместная работа</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </div>

          {/* Основная навигация по 5 модулям (с овальным выделением активного пункта как на скриншоте) */}
          <nav className="flex-1 px-2.5 py-1.5 space-y-1" aria-label="Основная навигация CRM">
            <button
              type="button"
              onClick={() => setActiveTab('CHAT')}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'CHAT'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <MessageSquare className="w-4 h-4 shrink-0 text-[#2fc6f6]" />
                <span className="truncate">Омниканальный чат</span>
              </span>
              {totalUnreadMessages > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono-tabular bg-rose-500 text-white rounded-full">
                  {totalUnreadMessages}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('KANBAN')}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'KANBAN'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Kanban className="w-4 h-4 shrink-0 text-[#a5de00]" />
                <span className="truncate">Канбан заказов</span>
              </span>
              <span className="text-[11px] font-mono-tabular text-white/75">
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'CUSTOMERS'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Users className="w-4 h-4 shrink-0 text-sky-300" />
                <span className="truncate">Клиенты и сегменты</span>
              </span>
              <span className="text-[11px] font-mono-tabular text-white/75">
                {customers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ANALYTICS')}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'ANALYTICS'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <BarChart3 className="w-4 h-4 shrink-0 text-amber-300" />
                <span className="truncate">Аналитика и Excel</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SECURITY_RBAC')}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'SECURITY_RBAC'
                  ? 'bg-white/25 text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="truncate">Безопасность и RBAC</span>
              </span>
            </button>
          </nav>

          {/* Переключатель филиалов сети */}
          <div className="p-3 border-t border-white/10 space-y-1.5">
            <label className="block text-[10px] text-white/60 font-medium">
              Активный филиал сети
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              aria-label="Выбор филиала сети"
              disabled={!activeRoleProfile.canAccessAllBranches}
              className="w-full px-2.5 py-1.5 text-xs font-medium bg-black/40 border border-white/20 rounded-lg text-white focus:outline-none disabled:opacity-60"
            >
              {activeRoleProfile.canAccessAllBranches && (
                <option value="ALL" className="text-slate-900">
                  Все филиалы сети ({branches.length})
                </option>
              )}
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="text-slate-900">
                  {b.city}: {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Переключатель активной роли RBAC */}
          <div className="p-3 border-t border-white/10 space-y-1.5">
            <label className="block text-[10px] text-white/60 font-medium">
              Активная роль (RBAC тест)
            </label>
            <select
              value={currentRole}
              onChange={(e) => handleSelectRole(e.target.value as RoleCode)}
              aria-label="Переключение роли RBAC"
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-black/40 border border-white/20 rounded-lg text-[#a5de00] focus:outline-none"
            >
              <option value="ADMIN" className="text-slate-900">
                Владелец / Админ
              </option>
              <option value="DIRECTOR" className="text-slate-900">
                Управляющий филиалом
              </option>
              <option value="MANAGER" className="text-slate-900">
                Менеджер продаж
              </option>
              <option value="FLORIST" className="text-slate-900">
                Флорист (Сборка)
              </option>
              <option value="COURIER" className="text-slate-900">
                Курьер (Доставка)
              </option>
            </select>
          </div>
        </div>
      </aside>

      {/* ГЛАВНАЯ ОБЛАСТЬ КОНТЕНТА */}
      <div className="flex-1 min-w-0 md:pl-60 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* ВЕРХНЯЯ ПАНЕЛЬ В СТИЛЕ BITRIX24 (Заголовок + Лаймовая кнопка + Поиск с голубым чипом) */}
        <header className="px-3 sm:px-5 pt-2.5 pb-2 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-20 bg-black/25 backdrop-blur-md border-b border-white/10">
          {/* Левая часть: Заголовок экрана + звездочка + Лаймовая кнопка СОЗДАТЬ / Быстрый заказ */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="md:hidden font-bold text-sm text-white whitespace-nowrap">
              Flower<span className="text-[#2fc6f6]">CRM</span>
            </span>

            <div className="hidden sm:flex items-center gap-2">
              <h2 className="text-xl font-light text-white tracking-wide whitespace-nowrap">
                {TAB_TITLES[activeTab]}
              </h2>
              <Star className="w-4 h-4 text-white/50 hover:text-amber-300 cursor-pointer" />
            </div>

            {/* Фирменная салатовая split-кнопка как на скриншоте, но с нашим названием Быстрый заказ */}
            <div className="inline-flex items-stretch rounded overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={openQuickOrderModal}
                className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 bg-[#a5de00] hover:bg-[#b5ee10] transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Быстрый заказ</span>
                <span className="sm:hidden">Заказ</span>
              </button>
              <button
                type="button"
                onClick={openQuickOrderModal}
                aria-label="Дополнительные опции создания заказа"
                className="px-2 bg-[#96ca00] hover:bg-[#a5de00] text-slate-950 border-l border-black/15 flex items-center"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Кнопка выбора воронки / филиала (как ОБЩАЯ на скриншоте) */}
            <div className="hidden lg:flex items-center">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                disabled={!activeRoleProfile.canAccessAllBranches}
                aria-label="Быстрый фильтр филиала в шапке"
                className="px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded focus:outline-none cursor-pointer"
              >
                {activeRoleProfile.canAccessAllBranches && (
                  <option value="ALL" className="text-slate-900">
                    Все филиалы ({branches.length})
                  </option>
                )}
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="text-slate-900">
                    {b.code}: {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Центральная строка поиска с голубым тегом «Заказы в работе» (как «Сделки в работе + поиск» на скриншоте) */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-2xl">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              aria-label="Быстрый поиск клиента по имени или телефону (Ctrl+K)"
              className="flex-1 min-w-0 flex items-center justify-between px-2 py-1.5 text-xs text-white/80 bg-black/35 hover:bg-black/45 border border-white/20 rounded transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#00b4e5] text-white text-[11px] font-semibold shrink-0">
                  <span>Заказы в работе</span>
                  <span className="opacity-75">×</span>
                </span>
                <span className="truncate text-white/75">
                  + Поиск клиента по имени, телефону, адресу...
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2 text-white/70">
                <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular bg-white/15 border border-white/20 rounded text-white">
                  Ctrl+K
                </kbd>
                <Search className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>

          {/* Правая группа: Колокольчик уведомлений и шестеренка настроек */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-label="Уведомления о заказах и чатах"
                className="p-2 text-white bg-black/35 hover:bg-black/50 border border-white/20 rounded relative transition-colors"
              >
                <Bell className="w-4 h-4" />
                {totalUnreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 text-[10px] font-mono-tabular font-bold bg-rose-500 text-white rounded-full">
                    {totalUnreadMessages}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 space-y-2.5 z-50 text-xs text-slate-900">
                  <div className="flex items-center justify-between font-semibold text-slate-900 border-b border-slate-100 pb-2">
                    <span>Оперативные уведомления</span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 text-slate-600">
                    <div className="p-2 rounded bg-slate-50">
                      <strong className="text-slate-900">Flowwow #FW-9948120:</strong> Клиент Елена Смирнова ждет фото собранных гортензий до 12:15.
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      <strong className="text-slate-900">Telegram:</strong> Александр Воронов подтвердил фото букета Pink O’Hara.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('SECURITY_RBAC')}
              title="Безопасность, RBAC и Инфраструктура"
              className="p-2 text-white bg-black/35 hover:bg-black/50 border border-white/20 rounded transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ВТОРАЯ ПОЛУПРОЗРАЧНАЯ ПАНЕЛЬ НАВИГАЦИИ И СЧЕТЧИКОВ (как полоса «Канбан | Список | Дела ... Мои: Входящие» на скриншоте) */}
        <div className="px-3 sm:px-5 pt-2">
          <div className="bg-black/30 backdrop-blur-md border border-white/15 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-white/90">
            {/* Левая группа: Быстрое переключение наших экранов с подчеркиванием активного */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('KANBAN')}
                className={`pb-0.5 font-semibold transition-colors ${
                  activeTab === 'KANBAN'
                    ? 'text-white border-b-2 border-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                Канбан заказов
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CHAT')}
                className={`pb-0.5 font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'CHAT'
                    ? 'text-white border-b-2 border-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                <span>Омниканальный чат</span>
                {totalUnreadMessages > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono-tabular bg-rose-500 text-white rounded-full">
                    {totalUnreadMessages}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CUSTOMERS')}
                className={`pb-0.5 font-semibold transition-colors ${
                  activeTab === 'CUSTOMERS'
                    ? 'text-white border-b-2 border-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                Клиенты и сегменты
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ANALYTICS')}
                className={`pb-0.5 font-semibold transition-colors ${
                  activeTab === 'ANALYTICS'
                    ? 'text-white border-b-2 border-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                Аналитика и Excel
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('SECURITY_RBAC')}
                className={`pb-0.5 font-semibold transition-colors ${
                  activeTab === 'SECURITY_RBAC'
                    ? 'text-white border-b-2 border-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                Безопасность и RBAC
              </button>
            </div>

            {/* Центральная группа: Счетчики «Мои: Входящие / Запланированные» */}
            <div className="hidden xl:flex items-center gap-3 text-[11px] text-white/80">
              <span>Мои:</span>
              <button
                type="button"
                onClick={() => setActiveTab('CHAT')}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white font-mono-tabular font-bold text-[10px]">
                  {totalUnreadMessages}
                </span>
                <span>Входящие чаты</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('KANBAN')}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white font-mono-tabular font-bold text-[10px]">
                  {orders.length}
                </span>
                <span>Заказы в сборке</span>
              </button>
            </div>

            {/* Правая группа: Роль RBAC и быстрый фильтр */}
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] font-medium text-white flex items-center gap-1.5">
                <Filter className="w-3 h-3 text-[#a5de00]" />
                <span>Роль: {activeRoleProfile.title}</span>
              </span>
            </div>
          </div>
        </div>

        {/* АКТИВНЫЙ ЭКРАН ПРИЛОЖЕНИЯ */}
        <main className="flex-1">
          {activeTab === 'CHAT' && (
            <div className="p-3 sm:p-5">
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-white/95 backdrop-blur-md">
                <OmnichannelChatView
                  conversations={conversations}
                  customers={customers}
                  orders={visibleOrders}
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  activeConversationId={activeConversationId}
                  onSelectConversation={(convId) => {
                    setActiveConversationId(convId);
                    setConversations((prev) =>
                      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
                    );
                  }}
                  onSendMessage={handleSendMessage}
                  onOpenCreateOrderFromChat={(conv, cust) => {
                    setEditingOrder(null);
                    setPrefillOrderCustomer(cust);
                    setPrefillOrderSource(conv.source);
                    setPrefillConversationId(conv.id);
                    setOrderModalOpen(true);
                  }}
                  onOpenExistingOrder={(ord) => {
                    setEditingOrder(ord);
                    setOrderModalOpen(true);
                  }}
                  onOpenCustomerProfile={(cust) => {
                    setSelectedCustomerProfile(cust);
                    setActiveTab('CUSTOMERS');
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'KANBAN' && (
            <OrdersKanbanView
              orders={visibleOrders}
              customers={customers}
              branches={branches}
              staff={staff}
              selectedBranchId={selectedBranchId}
              onOpenNewManualOrder={openQuickOrderModal}
              onOpenOrderModal={(ord) => {
                setEditingOrder(ord);
                setOrderModalOpen(true);
              }}
              onMoveOrderStatus={handleMoveOrderStatus}
              onQuickUploadBouquetPhoto={handleQuickUploadBouquetPhoto}
              onOpenChatTab={() => setActiveTab('CHAT')}
              onOpenAnalyticsTab={() => setActiveTab('ANALYTICS')}
            />
          )}

          {activeTab === 'CUSTOMERS' && (
            <div className="p-2 sm:p-4">
              <div className="rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/20">
                <CustomersDirectoryView
                  customers={customers}
                  orders={visibleOrders}
                  conversations={conversations}
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  selectedCustomerForModal={selectedCustomerProfile}
                  onSelectCustomerForModal={setSelectedCustomerProfile}
                  onCreateCustomer={(newCust) =>
                    setCustomers((prev) => [newCust, ...prev])
                  }
                  onMergeCustomers={handleMergeCustomers}
                  onOpenCreateOrderForCustomer={(cust) => {
                    setEditingOrder(null);
                    setPrefillOrderCustomer(cust);
                    setPrefillOrderSource(cust.firstContactSource);
                    setPrefillConversationId(undefined);
                    setOrderModalOpen(true);
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'ANALYTICS' && (
            <div className="p-2 sm:p-4">
              <div className="rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/20">
                <AnalyticsDashboardView
                  orders={visibleOrders}
                  conversations={conversations}
                  customers={customers}
                  branches={branches}
                  staff={staff}
                  selectedBranchId={selectedBranchId}
                />
              </div>
            </div>
          )}

          {activeTab === 'SECURITY_RBAC' && (
            <div className="p-2 sm:p-4">
              <div className="rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/20">
                <SecurityRbacView
                  currentRole={currentRole}
                  onSelectRole={handleSelectRole}
                  branches={branches}
                  onAddBranch={handleAddBranch}
                  vaultItems={vaultItems}
                  onRotateVaultKey={handleRotateVaultKey}
                  auditLogs={auditLogs}
                  orders={orders}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* МОБИЛЬНАЯ НИЖНЯЯ НАВИГАЦИЯ (Bottom Navigation Bar < 15% высоты экрана) */}
      <nav
        aria-label="Мобильная навигация"
        className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-slate-950/90 backdrop-blur-md border-t border-white/15 grid grid-cols-5 z-30 text-white"
      >
        <button
          type="button"
          onClick={() => setActiveTab('CHAT')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            activeTab === 'CHAT' ? 'text-[#2fc6f6] font-bold' : 'text-white/70'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Чаты ({totalUnreadMessages})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('KANBAN')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            activeTab === 'KANBAN' ? 'text-[#a5de00] font-bold' : 'text-white/70'
          }`}
        >
          <Kanban className="w-4 h-4" />
          <span>Канбан</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CUSTOMERS')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            activeTab === 'CUSTOMERS' ? 'text-[#2fc6f6] font-bold' : 'text-white/70'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Клиенты</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ANALYTICS')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            activeTab === 'ANALYTICS' ? 'text-[#2fc6f6] font-bold' : 'text-white/70'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Аналитика</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SECURITY_RBAC')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            activeTab === 'SECURITY_RBAC'
              ? 'text-[#a5de00] font-bold'
              : 'text-white/70'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>RBAC</span>
        </button>
      </nav>

      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ЗАКАЗА */}
      <OrderFormModal
        isOpen={orderModalOpen}
        onClose={() => {
          setOrderModalOpen(false);
          setEditingOrder(null);
        }}
        existingOrder={editingOrder}
        prefillCustomer={prefillOrderCustomer}
        prefillSource={prefillOrderSource}
        prefillConversationId={prefillConversationId}
        selectedBranchId={selectedBranchId}
        branches={branches}
        customers={customers}
        staff={staff}
        catalogProducts={catalogProducts}
        ingredients={ingredients}
        onSaveOrder={handleSaveOrder}
      />

      {/* МОДАЛЬНОЕ ОКНО ГЛОБАЛЬНОГО ПОИСКА (Ctrl+K) */}
      {globalSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 pt-16 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Глобальный поиск клиента"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl overflow-hidden shadow-xl">
            <div className="p-3.5 border-b border-slate-200 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Введите имя клиента, телефон (+7...) или улицу получателя..."
                className="flex-1 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setGlobalSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {globalSearchResults.map((cust) => (
                <div
                  key={cust.id}
                  className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{cust.fullName}</div>
                    <div className="text-slate-500 font-mono-tabular">
                      {cust.phone} · LTV: {formatCurrency(cust.totalSpentLtv)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerProfile(cust);
                        setActiveTab('CUSTOMERS');
                        setGlobalSearchOpen(false);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium"
                    >
                      Открыть профиль
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOrder(null);
                        setPrefillOrderCustomer(cust);
                        setPrefillOrderSource(cust.firstContactSource);
                        setGlobalSearchOpen(false);
                        setOrderModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-[#a5de00] text-slate-950 rounded font-bold"
                    >
                      + Заказ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
