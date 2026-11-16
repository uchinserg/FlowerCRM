// src/components/OrdersKanbanView.tsx
import React, { useState, useMemo } from 'react';
import {
  Branch,
  Customer,
  Order,
  OrderStatus,
  StaffUser,
} from '../types/crm';
import {
  CHANNEL_META,
  PHOTO_STATUS_LABELS,
  ResilientBouquetImage,
} from './ChannelBadge';
import { formatCurrency, validateKanbanTransition } from '../utils/crmLogic';
import { BOUQUET_IMAGES } from '../data/seedData';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Globe,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Send,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import { ORDER_STATUS_LABELS } from './ChannelBadge';

interface OrdersKanbanViewProps {
  orders: Order[];
  customers: Customer[];
  branches: Branch[];
  staff: StaffUser[];
  selectedBranchId: string;
  onOpenNewManualOrder: () => void;
  onOpenOrderModal: (order: Order) => void;
  onMoveOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onQuickUploadBouquetPhoto: (orderId: string, photoUrl: string) => void;
  onOpenChatTab?: () => void;
  onOpenAnalyticsTab?: () => void;
}

export type ColumnFunctionType =
  | 'INTAKE_QUEUE'
  | 'FLORIST_ASSEMBLY'
  | 'PHOTO_APPROVAL_GATE'
  | 'READY_FOR_DISPATCH'
  | 'COURIER_DELIVERY'
  | 'CUSTOM_BUFFER';

interface ColumnFunctionPreset {
  id: ColumnFunctionType;
  label: string;
  shortBadge: string;
  description: string;
  defaultStatuses: OrderStatus[];
  primaryStatus: OrderStatus;
  nextStatus?: OrderStatus;
  nextButtonLabel?: string;
  requirePhotoOnEnter: boolean;
  isCustomBuffer?: boolean;
}

const COLUMN_FUNCTION_PRESETS: ColumnFunctionPreset[] = [
  {
    id: 'INTAKE_QUEUE',
    label: 'Прием заказов и очередь оплаты',
    shortBadge: 'Прием и очередь',
    description:
      'Входящие заявки из чатов и маркетплейсов, ожидание оплаты и постановка в очередь сборки',
    defaultStatuses: ['NEW', 'CONFIRMED_AWAITING_PAYMENT', 'PAID_IN_QUEUE'],
    primaryStatus: 'PAID_IN_QUEUE',
    nextStatus: 'IN_ASSEMBLY',
    nextButtonLabel: 'Передать флористу в сборку',
    requirePhotoOnEnter: false,
  },
  {
    id: 'FLORIST_ASSEMBLY',
    label: 'Сборка букета флористом (Производство)',
    shortBadge: 'Сборка в цеху',
    description:
      'Активная сборка букета по техкарте в холодильнике и фиксация себестоимости стеблей',
    defaultStatuses: ['IN_ASSEMBLY'],
    primaryStatus: 'IN_ASSEMBLY',
    nextStatus: 'PHOTO_APPROVAL',
    nextButtonLabel: 'На согласование фото',
    requirePhotoOnEnter: false,
  },
  {
    id: 'PHOTO_APPROVAL_GATE',
    label: 'Контроль качества и согласование фото',
    shortBadge: 'Фотоконтроль',
    description:
      'Проверка фото готового букета до отправки клиенту и блокировка без загруженного снимка',
    defaultStatuses: ['PHOTO_APPROVAL'],
    primaryStatus: 'PHOTO_APPROVAL',
    nextStatus: 'READY_FOR_DELIVERY',
    nextButtonLabel: 'Подтвердить -> Готов к доставке',
    requirePhotoOnEnter: true,
  },
  {
    id: 'READY_FOR_DISPATCH',
    label: 'Готовность к выдаче / Ожидание курьера',
    shortBadge: 'Готов к отгрузке',
    description:
      'Упакованные букеты с согласованным фото, ожидающие назначения курьера или самовывоза',
    defaultStatuses: ['READY_FOR_DELIVERY'],
    primaryStatus: 'READY_FOR_DELIVERY',
    nextStatus: 'IN_DELIVERY',
    nextButtonLabel: 'Передать курьеру',
    requirePhotoOnEnter: true,
  },
  {
    id: 'COURIER_DELIVERY',
    label: 'Доставка курьером и завершение сделки',
    shortBadge: 'Доставка и вручение',
    description:
      'Заказы на маршруте у курьеров и выполненные заказы с закрытием оплаты и начислением LTV',
    defaultStatuses: ['IN_DELIVERY', 'COMPLETED'],
    primaryStatus: 'COMPLETED',
    nextStatus: 'COMPLETED',
    nextButtonLabel: 'Отметить врученным',
    requirePhotoOnEnter: true,
  },
  {
    id: 'CUSTOM_BUFFER',
    label: 'Пользовательский этап (ручной буфер / доп. контроль)',
    shortBadge: 'Свободный этап',
    description:
      'Дополнительный столбец для ручного перемещения карточек (VIP-упаковка, сбор отзывов, ожидание поставки)',
    defaultStatuses: [],
    primaryStatus: 'COMPLETED',
    nextStatus: undefined,
    nextButtonLabel: 'Завершить этап',
    requirePhotoOnEnter: false,
    isCustomBuffer: true,
  },
];

const ALL_ORDER_STATUSES: OrderStatus[] = [
  'NEW',
  'CONFIRMED_AWAITING_PAYMENT',
  'PAID_IN_QUEUE',
  'IN_ASSEMBLY',
  'PHOTO_APPROVAL',
  'READY_FOR_DELIVERY',
  'IN_DELIVERY',
  'COMPLETED',
];

interface KanbanColumnConfig {
  id: string;
  title: string;
  shortHeaderTitle: string;
  functionType: ColumnFunctionType;
  functionBadge: string;
  statuses: OrderStatus[];
  primaryStatus: OrderStatus;
  nextStatus?: OrderStatus;
  nextButtonLabel?: string;
  requirePhotoOnEnter?: boolean;
  chevronBgClass: string;
  cardBorderLeftClass: string;
  chevronPosition: 'first' | 'mid' | 'last';
  isCustom?: boolean;
}

const INITIAL_KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'col-new',
    title: '01. Новые и в очереди',
    shortHeaderTitle: '01. Новые и в очереди',
    functionType: 'INTAKE_QUEUE',
    functionBadge: 'Прием и очередь',
    statuses: ['NEW', 'CONFIRMED_AWAITING_PAYMENT', 'PAID_IN_QUEUE'],
    primaryStatus: 'PAID_IN_QUEUE',
    nextStatus: 'IN_ASSEMBLY',
    nextButtonLabel: 'Передать флористу в сборку',
    requirePhotoOnEnter: false,
    chevronBgClass: 'bg-[#2fc6f6] text-slate-950',
    cardBorderLeftClass: 'border-l-[#2fc6f6]',
    chevronPosition: 'first',
  },
  {
    id: 'col-assembly',
    title: '02. На сборке у флориста',
    shortHeaderTitle: '02. На сборке у флориста',
    functionType: 'FLORIST_ASSEMBLY',
    functionBadge: 'Сборка в цеху',
    statuses: ['IN_ASSEMBLY'],
    primaryStatus: 'IN_ASSEMBLY',
    nextStatus: 'PHOTO_APPROVAL',
    nextButtonLabel: 'На согласование фото',
    requirePhotoOnEnter: false,
    chevronBgClass: 'bg-[#15b9e6] text-slate-950',
    cardBorderLeftClass: 'border-l-[#15b9e6]',
    chevronPosition: 'mid',
  },
  {
    id: 'col-photo',
    title: '03. Фото букета на согласовании',
    shortHeaderTitle: '03. Согласование фото',
    functionType: 'PHOTO_APPROVAL_GATE',
    functionBadge: 'Фотоконтроль',
    statuses: ['PHOTO_APPROVAL'],
    primaryStatus: 'PHOTO_APPROVAL',
    nextStatus: 'READY_FOR_DELIVERY',
    nextButtonLabel: 'Подтвердить -> Готов к доставке',
    requirePhotoOnEnter: true,
    chevronBgClass: 'bg-[#29d0be] text-slate-950',
    cardBorderLeftClass: 'border-l-[#29d0be]',
    chevronPosition: 'mid',
  },
  {
    id: 'col-ready',
    title: '04. Готов к выдаче / доставке',
    shortHeaderTitle: '04. Готов к доставке',
    functionType: 'READY_FOR_DISPATCH',
    functionBadge: 'Готов к отгрузке',
    statuses: ['READY_FOR_DELIVERY'],
    primaryStatus: 'READY_FOR_DELIVERY',
    nextStatus: 'IN_DELIVERY',
    nextButtonLabel: 'Передать курьеру',
    requirePhotoOnEnter: true,
    chevronBgClass: 'bg-[#37d49c] text-slate-950',
    cardBorderLeftClass: 'border-l-[#37d49c]',
    chevronPosition: 'mid',
  },
  {
    id: 'col-delivery',
    title: '05. У курьера и Выполнены',
    shortHeaderTitle: '05. У курьера / Выполнены',
    functionType: 'COURIER_DELIVERY',
    functionBadge: 'Доставка и вручение',
    statuses: ['IN_DELIVERY', 'COMPLETED'],
    primaryStatus: 'COMPLETED',
    nextStatus: 'COMPLETED',
    nextButtonLabel: 'Отметить врученным',
    requirePhotoOnEnter: true,
    chevronBgClass: 'bg-[#7bd500] text-slate-950',
    cardBorderLeftClass: 'border-l-[#7bd500]',
    chevronPosition: 'last',
  },
];

const STAGE_COLOR_PRESETS = [
  {
    id: 'lime',
    label: 'Лаймовый',
    chevronBgClass: 'bg-[#a5de00] text-slate-950',
    cardBorderLeftClass: 'border-l-[#a5de00]',
    swatchClass: 'bg-[#a5de00]',
  },
  {
    id: 'sky',
    label: 'Голубой',
    chevronBgClass: 'bg-[#2fc6f6] text-slate-950',
    cardBorderLeftClass: 'border-l-[#2fc6f6]',
    swatchClass: 'bg-[#2fc6f6]',
  },
  {
    id: 'turquoise',
    label: 'Бирюзовый',
    chevronBgClass: 'bg-[#29d0be] text-slate-950',
    cardBorderLeftClass: 'border-l-[#29d0be]',
    swatchClass: 'bg-[#29d0be]',
  },
  {
    id: 'emerald',
    label: 'Изумрудный',
    chevronBgClass: 'bg-[#37d49c] text-slate-950',
    cardBorderLeftClass: 'border-l-[#37d49c]',
    swatchClass: 'bg-[#37d49c]',
  },
  {
    id: 'amber',
    label: 'Янтарный',
    chevronBgClass: 'bg-[#fbbf24] text-slate-950',
    cardBorderLeftClass: 'border-l-[#fbbf24]',
    swatchClass: 'bg-[#fbbf24]',
  },
];

export const OrdersKanbanView: React.FC<OrdersKanbanViewProps> = ({
  orders,
  customers,
  branches,
  staff,
  selectedBranchId,
  onOpenNewManualOrder,
  onOpenOrderModal,
  onMoveOrderStatus,
  onQuickUploadBouquetPhoto,
  onOpenChatTab,
  onOpenAnalyticsTab,
}) => {
  const [kanbanColumns, setKanbanColumns] =
    useState<KanbanColumnConfig[]>(INITIAL_KANBAN_COLUMNS);
  const [customColumnByOrderId, setCustomColumnByOrderId] = useState<
    Record<string, string>
  >({});

  // Состояние добавления нового этапа (столбца) Канбана по нажатию на выделенную кнопку «+»
  const [isAddColumnOpen, setIsAddColumnOpen] = useState<boolean>(false);
  const [newColumnTitle, setNewColumnTitle] = useState<string>(
    '06. Контроль вручения и отзыв'
  );
  const [selectedColorPresetId, setSelectedColorPresetId] = useState<string>('lime');
  const [newColumnFunctionType, setNewColumnFunctionType] =
    useState<ColumnFunctionType>('CUSTOM_BUFFER');

  // Состояние редактирования функции и настроек существующего столбца по нажатию на карандаш на стрелке
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editColTitle, setEditColTitle] = useState<string>('');
  const [editColFunctionType, setEditColFunctionType] =
    useState<ColumnFunctionType>('INTAKE_QUEUE');
  const [editColStatuses, setEditColStatuses] = useState<OrderStatus[]>([]);
  const [editColPrimaryStatus, setEditColPrimaryStatus] =
    useState<OrderStatus>('PAID_IN_QUEUE');
  const [editColNextStatus, setEditColNextStatus] = useState<OrderStatus | 'NONE'>(
    'IN_ASSEMBLY'
  );
  const [editColNextButtonLabel, setEditColNextButtonLabel] = useState<string>('');
  const [editColRequirePhoto, setEditColRequirePhoto] = useState<boolean>(false);
  const [editColColorPresetId, setEditColColorPresetId] = useState<string>('sky');

  const [floristFilter, setFloristFilter] = useState<string>('ALL');
  const [qualityGateError, setQualityGateError] = useState<{
    orderId: string;
    message: string;
  } | null>(null);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);

  const florists = useMemo(
    () => staff.filter((s) => s.role === 'FLORIST'),
    [staff]
  );

  const visibleOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedBranchId !== 'ALL' && o.branchId !== selectedBranchId) return false;
      if (floristFilter !== 'ALL' && o.floristUserId !== floristFilter) return false;
      return true;
    });
  }, [orders, selectedBranchId, floristFilter]);

  const openEditColumnModal = (col: KanbanColumnConfig) => {
    setIsAddColumnOpen(false);
    setEditingColumnId(col.id);
    setEditColTitle(col.title);
    setEditColFunctionType(col.functionType);
    setEditColStatuses(col.statuses);
    setEditColPrimaryStatus(col.primaryStatus);
    setEditColNextStatus(col.nextStatus ?? 'NONE');
    setEditColNextButtonLabel(col.nextButtonLabel ?? '');
    setEditColRequirePhoto(Boolean(col.requirePhotoOnEnter));

    const matchedColor = STAGE_COLOR_PRESETS.find(
      (p) => p.chevronBgClass === col.chevronBgClass
    );
    setEditColColorPresetId(matchedColor ? matchedColor.id : 'sky');
  };

  const handleSelectEditFunctionPreset = (fnType: ColumnFunctionType) => {
    setEditColFunctionType(fnType);
    const preset = COLUMN_FUNCTION_PRESETS.find((p) => p.id === fnType);
    if (!preset) return;
    setEditColStatuses([...preset.defaultStatuses]);
    setEditColPrimaryStatus(preset.primaryStatus);
    setEditColNextStatus(preset.nextStatus ?? 'NONE');
    setEditColNextButtonLabel(preset.nextButtonLabel ?? '');
    setEditColRequirePhoto(preset.requirePhotoOnEnter);
  };

  const handleToggleEditStatus = (st: OrderStatus) => {
    setEditColStatuses((prev) =>
      prev.includes(st) ? prev.filter((item) => item !== st) : [...prev, st]
    );
  };

  const handleSaveColumnFunction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColumnId) return;
    const trimmedTitle = editColTitle.trim() || 'Этап Канбана';
    const fnPreset =
      COLUMN_FUNCTION_PRESETS.find((p) => p.id === editColFunctionType) ||
      COLUMN_FUNCTION_PRESETS[0];
    const colorPreset =
      STAGE_COLOR_PRESETS.find((p) => p.id === editColColorPresetId) ||
      STAGE_COLOR_PRESETS[0];

    const isCustomMode =
      editColFunctionType === 'CUSTOM_BUFFER' && editColStatuses.length === 0;

    setKanbanColumns((prev) =>
      prev.map((col) => {
        if (col.id === editingColumnId) {
          return {
            ...col,
            title: trimmedTitle,
            shortHeaderTitle: trimmedTitle,
            functionType: editColFunctionType,
            functionBadge: fnPreset.shortBadge,
            statuses: editColStatuses,
            primaryStatus:
              editColStatuses[0] || editColPrimaryStatus || fnPreset.primaryStatus,
            nextStatus:
              editColNextStatus === 'NONE' ? undefined : editColNextStatus,
            nextButtonLabel: editColNextButtonLabel.trim() || undefined,
            requirePhotoOnEnter: editColRequirePhoto,
            chevronBgClass: colorPreset.chevronBgClass,
            cardBorderLeftClass: colorPreset.cardBorderLeftClass,
            isCustom: isCustomMode,
          };
        }
        // Если пользователем переназначены конкретные статусы на редактируемый столбец,
        // убираем пересекающиеся статусы из других столбцов, чтобы заказы однозначно перешли в этот столбец
        if (!isCustomMode && editColStatuses.length > 0) {
          return {
            ...col,
            statuses: col.statuses.filter((s) => !editColStatuses.includes(s)),
          };
        }
        return col;
      })
    );

    setEditingColumnId(null);
  };

  const handleDeleteColumn = (colId: string) => {
    if (kanbanColumns.length <= 1) return;
    setKanbanColumns((prev) => {
      const filtered = prev.filter((c) => c.id !== colId);
      return filtered.map((c, idx) => ({
        ...c,
        chevronPosition:
          idx === 0
            ? 'first'
            : idx === filtered.length - 1
            ? 'last'
            : 'mid',
      }));
    });
    setCustomColumnByOrderId((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((orderId) => {
        if (next[orderId] === colId) delete next[orderId];
      });
      return next;
    });
    setEditingColumnId(null);
  };

  const attemptStatusChange = (
    order: Order,
    nextStatus: OrderStatus,
    targetColumn?: KanbanColumnConfig
  ) => {
    setQualityGateError(null);
    if (targetColumn?.requirePhotoOnEnter && !order.beforeDeliveryPhotoUrl) {
      setQualityGateError({
        orderId: order.id,
        message: `Столбец «${targetColumn.title}» (${targetColumn.functionBadge}) требует обязательного фото готового букета перед переносом.`,
      });
      return;
    }
    const check = validateKanbanTransition(order, nextStatus);
    if (!check.allowed) {
      setQualityGateError({
        orderId: order.id,
        message: check.error || 'Требуется загрузить фото готового букета',
      });
      return;
    }
    // Если заказ был в пользовательском столбце, сбрасываем привязку при штатном переводе статуса
    setCustomColumnByOrderId((prev) => {
      if (!prev[order.id]) return prev;
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    onMoveOrderStatus(order.id, nextStatus);
  };

  const handleDropOnColumn = (col: KanbanColumnConfig) => {
    if (!draggedOrderId) return;
    const order = orders.find((o) => o.id === draggedOrderId);
    setDraggedOrderId(null);
    if (!order) return;

    if (col.requirePhotoOnEnter && !order.beforeDeliveryPhotoUrl) {
      setQualityGateError({
        orderId: order.id,
        message: `Столбец «${col.title}» (${col.functionBadge}) требует загрузить фото букета перед переводом карточки.`,
      });
      return;
    }

    if (col.isCustom || col.statuses.length === 0) {
      setCustomColumnByOrderId((prev) => ({
        ...prev,
        [order.id]: col.id,
      }));
      return;
    }

    attemptStatusChange(order, col.primaryStatus, col);
  };

  const handleCreateKanbanColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newColumnTitle.trim();
    if (!trimmed) return;

    const preset =
      STAGE_COLOR_PRESETS.find((p) => p.id === selectedColorPresetId) ||
      STAGE_COLOR_PRESETS[0];
    const fnPreset =
      COLUMN_FUNCTION_PRESETS.find((p) => p.id === newColumnFunctionType) ||
      COLUMN_FUNCTION_PRESETS[COLUMN_FUNCTION_PRESETS.length - 1];

    const newColId = `col-custom-${Date.now()}`;
    setKanbanColumns((prev) => {
      const updatedPrev = prev.map((c, idx) => ({
        ...c,
        chevronPosition: (idx === 0 ? 'first' : 'mid') as 'first' | 'mid' | 'last',
      }));
      const newCol: KanbanColumnConfig = {
        id: newColId,
        title: trimmed,
        shortHeaderTitle: trimmed,
        functionType: fnPreset.id,
        functionBadge: fnPreset.shortBadge,
        statuses: [...fnPreset.defaultStatuses],
        primaryStatus: fnPreset.primaryStatus,
        nextStatus: fnPreset.nextStatus,
        nextButtonLabel: fnPreset.nextButtonLabel,
        requirePhotoOnEnter: fnPreset.requirePhotoOnEnter,
        chevronBgClass: preset.chevronBgClass,
        cardBorderLeftClass: preset.cardBorderLeftClass,
        chevronPosition: 'last',
        isCustom: Boolean(fnPreset.isCustomBuffer),
      };
      return [...updatedPrev, newCol];
    });

    const nextIdx = String(kanbanColumns.length + 2).padStart(2, '0');
    setNewColumnTitle(`${nextIdx}. Новый этап Канбана`);
    setIsAddColumnOpen(false);
  };

  return (
    <div className="px-3 sm:px-5 py-3 space-y-3.5 max-w-[1680px] mx-auto">
      {/* Полупрозрачная панель управления и фильтров в стиле Bitrix24 */}
      <div className="bg-black/30 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">
              Канбан-доска заказов и контроль сборки
            </h1>
            <p className="text-[11px] text-white/75">
              Контроль рецептуры, себестоимости, обязательного фото букета до доставки и настройка функций столбцов
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={floristFilter}
            onChange={(e) => setFloristFilter(e.target.value)}
            aria-label="Фильтр по флористу"
            className="px-3 py-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-full focus:outline-none"
          >
            <option value="ALL" className="text-slate-900">
              Все флористы смены
            </option>
            {florists.map((f) => (
              <option key={f.id} value={f.id} className="text-slate-900">
                {f.fullName}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenNewManualOrder}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-[#a5de00] hover:bg-[#b5ee10] rounded-full shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Новый заказ (в зал / по телефону)
          </button>
        </div>
      </div>

      {/* Панель редактирования функции и параметров столбца Канбана (открывается по кнопке карандаша на стрелке столбца) */}
      {editingColumnId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Редактирование функции столбца Канбана"
          className="bg-black/75 backdrop-blur-md border border-[#2fc6f6]/50 rounded-xl p-4 text-white shadow-2xl space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2.5">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#2fc6f6]" />
              <h2 className="text-xs sm:text-sm font-bold text-white">
                Настройка столбца и изменение функции этапа Канбана
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditingColumnId(null)}
              className="text-xs text-white/70 hover:text-white px-2 py-0.5 rounded bg-white/10"
            >
              Закрыть ✕
            </button>
          </div>

          <form onSubmit={handleSaveColumnFunction} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 1. Название столбца и выбор основной функции */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#a5de00] mb-1">
                    Название столбца на стрелке
                  </label>
                  <input
                    type="text"
                    value={editColTitle}
                    onChange={(e) => setEditColTitle(e.target.value)}
                    placeholder="Название этапа..."
                    className="w-full px-3 py-1.5 text-xs font-medium bg-white/95 text-slate-900 rounded-lg border border-white/30 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2fc6f6] mb-1">
                    Функция столбца (бизнес-роль этапа в CRM)
                  </label>
                  <select
                    value={editColFunctionType}
                    onChange={(e) =>
                      handleSelectEditFunctionPreset(
                        e.target.value as ColumnFunctionType
                      )
                    }
                    aria-label="Выбор функции столбца"
                    className="w-full px-3 py-2 text-xs font-semibold bg-white text-slate-900 rounded-lg border border-[#2fc6f6] focus:outline-none"
                  >
                    {COLUMN_FUNCTION_PRESETS.map((fn) => (
                      <option key={fn.id} value={fn.id} className="text-slate-900">
                        {fn.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-white/75 leading-snug">
                    {
                      COLUMN_FUNCTION_PRESETS.find(
                        (p) => p.id === editColFunctionType
                      )?.description
                    }
                  </p>
                </div>
              </div>

              {/* 2. Статусы заказов, которые отображаются и обрабатываются этим столбцом */}
              <div className="space-y-2">
                <span className="block text-[11px] font-bold text-white/90">
                  Отображаемые статусы заказов в этом столбце:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {ALL_ORDER_STATUSES.map((st) => {
                    const checked = editColStatuses.includes(st);
                    return (
                      <label
                        key={st}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-[#2fc6f6]/25 border-[#2fc6f6] text-white font-semibold'
                            : 'bg-white/5 border-white/15 text-white/75 hover:bg-white/10'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleEditStatus(st)}
                          className="rounded accent-[#a5de00]"
                        />
                        <span className="truncate">{ORDER_STATUS_LABELS[st]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 3. Автоматика при переводе, кнопка карточки, фотоконтроль и цвет стрелки */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-white/80 mb-1">
                      Кнопка действия на карточке
                    </label>
                    <input
                      type="text"
                      value={editColNextButtonLabel}
                      onChange={(e) => setEditColNextButtonLabel(e.target.value)}
                      placeholder="Например: Передать курьеру"
                      className="w-full px-2.5 py-1.5 text-xs bg-white/95 text-slate-900 rounded-lg border border-white/25 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/80 mb-1">
                      Переводить карточку в статус
                    </label>
                    <select
                      value={editColNextStatus}
                      onChange={(e) =>
                        setEditColNextStatus(
                          e.target.value as OrderStatus | 'NONE'
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white/95 text-slate-900 rounded-lg border border-white/25 focus:outline-none"
                    >
                      <option value="NONE">Без кнопки перевода</option>
                      {ALL_ORDER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {ORDER_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={editColRequirePhoto}
                    onChange={(e) => setEditColRequirePhoto(e.target.checked)}
                    className="rounded accent-[#a5de00]"
                  />
                  <span>
                    Требовать <strong>фото готового букета</strong> при переводе в этот столбец
                  </span>
                </label>

                <div>
                  <span className="block text-[11px] text-white/80 mb-1">
                    Цвет стрелки столбца:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {STAGE_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setEditColColorPresetId(preset.id)}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 border transition-all ${
                          editColColorPresetId === preset.id
                            ? 'bg-white text-slate-950 border-white shadow'
                            : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${preset.swatchClass}`}
                        />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/15">
              <div>
                {kanbanColumns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteColumn(editingColumnId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:text-white bg-rose-950/60 hover:bg-rose-800/80 border border-rose-400/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить столбец
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#a5de00] hover:bg-[#b5ee10] text-slate-950 rounded-lg shadow transition-colors"
                >
                  Сохранить функцию столбца
                </button>
                <button
                  type="button"
                  onClick={() => setEditingColumnId(null)}
                  className="px-3 py-2 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Модальное окно / панель создания нового столбца (этапа) Канбана при клике на «+» */}
      {isAddColumnOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Добавление нового этапа Канбана"
          className="bg-black/65 backdrop-blur-md border border-white/25 rounded-xl p-4 text-white shadow-2xl"
        >
          <form
            onSubmit={handleCreateKanbanColumn}
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"
          >
            <div className="flex-1 space-y-1.5">
              <label className="block text-xs font-bold text-[#a5de00]">
                Новый столбец (этап) Канбана
              </label>
              <input
                type="text"
                autoFocus
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                placeholder="Например: 06. Контроль вручения и фотоотчет"
                className="w-full px-3.5 py-2 text-xs font-medium bg-white/95 text-slate-900 rounded-lg border border-white/30 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/80">
                Функция нового столбца
              </label>
              <select
                value={newColumnFunctionType}
                onChange={(e) =>
                  setNewColumnFunctionType(e.target.value as ColumnFunctionType)
                }
                aria-label="Функция нового столбца"
                className="px-3 py-2 text-xs font-semibold bg-white/95 text-slate-900 rounded-lg border border-white/30 focus:outline-none"
              >
                {COLUMN_FUNCTION_PRESETS.map((fn) => (
                  <option key={fn.id} value={fn.id} className="text-slate-900">
                    {fn.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-white/80">
                Цвет заголовка этапа
              </span>
              <div className="flex items-center gap-2">
                {STAGE_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedColorPresetId(preset.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                      selectedColorPresetId === preset.id
                        ? 'bg-white text-slate-950 border-white scale-105 shadow'
                        : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${preset.swatchClass}`} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#a5de00] hover:bg-[#b5ee10] text-slate-950 rounded-lg shadow transition-colors"
              >
                + Создать столбец
              </button>
              <button
                type="button"
                onClick={() => setIsAddColumnOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Уведомление блокировки Контроля качества (Фото готового букета до доставки) */}
      {qualityGateError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-950/90 backdrop-blur-md border border-red-400/50 text-white flex flex-wrap items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm">
              <p className="font-bold text-amber-300">
                Сработала защита качества цветочного салона
              </p>
              <p className="mt-0.5 text-white/95">{qualityGateError.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onQuickUploadBouquetPhoto(
                  qualityGateError.orderId,
                  BOUQUET_IMAGES.HYDRANGEA_CLOUD
                );
                setQualityGateError(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#a5de00] hover:bg-[#b5ee10] text-slate-950 rounded-full shadow"
            >
              <Camera className="w-3.5 h-3.5" />
              Загрузить фото готового букета сейчас
            </button>
            <button
              type="button"
              onClick={() => setQualityGateError(null)}
              className="px-2.5 py-1.5 text-xs text-white/80 hover:text-white hover:underline"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Сетка колонок Канбана в стиле Bitrix24 (шеврон-стрелки + кнопка редактирования функции + крупная сумма) */}
      <div
        className={
          kanbanColumns.length <= 5
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5 items-start'
            : 'grid grid-cols-1 md:grid-cols-2 xl:flex xl:flex-row gap-2.5 items-start overflow-x-auto pb-3'
        }
      >
        {kanbanColumns.map((col, colIndex) => {
          const colOrders = visibleOrders.filter((o) => {
            const customColId = customColumnByOrderId[o.id];
            if (col.isCustom) {
              return customColId === col.id;
            }
            if (customColId) {
              return false;
            }
            return col.statuses.includes(o.status);
          });
          const colRevenue = colOrders.reduce((s, o) => s + o.totalPrice, 0);
          const isLastColumn = colIndex === kanbanColumns.length - 1;
          const chevronClipClass =
            colIndex === 0
              ? 'b24-chevron-first'
              : isLastColumn
              ? 'b24-chevron-last'
              : 'b24-chevron-mid';

          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOnColumn(col)}
              className={`flex flex-col min-h-[620px] xl:border-r xl:border-white/15 xl:pr-2 last:border-r-0 last:pr-0 ${
                kanbanColumns.length > 5 ? 'xl:min-w-[185px] xl:flex-1' : 'min-w-0'
              }`}
            >
              {/* Шеврон-стрелка стадии с кнопкой редактирования функции столбца */}
              <div
                className={`${col.chevronBgClass} ${chevronClipClass} h-9 pl-3.5 pr-4 flex items-center justify-between gap-1 shadow-sm`}
              >
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <h2
                    className="text-xs font-bold truncate"
                    title={`${col.title} — Функция: ${col.functionBadge}`}
                  >
                    {col.title}
                  </h2>
                  <span className="text-[11px] font-mono-tabular font-semibold opacity-80 shrink-0">
                    ({colOrders.length})
                  </span>
                </div>

                {/* Кнопка редактирования функции столбца на каждой стрелке */}
                <button
                  type="button"
                  title={`Изменить функцию столбца «${col.title}» (${col.functionBadge})`}
                  aria-label={`Редактировать функцию столбца ${col.title}`}
                  onClick={() => openEditColumnModal(col)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all shadow-sm ${
                    editingColumnId === col.id
                      ? 'bg-slate-950 text-[#a5de00] scale-105'
                      : 'bg-white/40 hover:bg-white/85 text-slate-900 active:scale-95'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                </button>

                {(colIndex === 4 || isLastColumn) && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Добавить новый этап (столбец) Канбана"
                    aria-label="Добавить новый этап Канбана"
                    onClick={() => {
                      setEditingColumnId(null);
                      setIsAddColumnOpen((v) => !v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditingColumnId(null);
                        setIsAddColumnOpen((v) => !v);
                      }
                    }}
                    className="w-5 h-5 rounded-full bg-white/40 hover:bg-white/80 active:scale-95 flex items-center justify-center text-slate-900 font-bold text-xs shrink-0 cursor-pointer transition-all shadow-sm select-none"
                  >
                    +
                  </span>
                )}
              </div>

              {/* Индикатор текущей функции столбца + крупная белая сумма заказов */}
              <div className="pt-1.5 pb-2.5 text-center space-y-0.5">
                <button
                  type="button"
                  onClick={() => openEditColumnModal(col)}
                  title="Нажмите, чтобы изменить функцию этого столбца"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/25 hover:bg-black/45 border border-white/15 text-[10px] font-medium text-white/90 transition-colors"
                >
                  <Settings2 className="w-2.5 h-2.5 text-[#2fc6f6] shrink-0" />
                  <span className="truncate">{col.functionBadge}</span>
                  {col.requirePhotoOnEnter && (
                    <Camera
                      className="w-2.5 h-2.5 text-[#a5de00] shrink-0"
                      aria-label="Обязателен фотоконтроль"
                    />
                  )}
                </button>
                <div className="text-2xl sm:text-[26px] font-light text-white tracking-tight font-mono-tabular drop-shadow">
                  {formatCurrency(colRevenue)}
                </div>
              </div>

              {/* Полупрозрачная кнопка быстрого добавления под суммой */}
              <div className="mb-3">
                <button
                  type="button"
                  onClick={onOpenNewManualOrder}
                  aria-label={
                    colIndex === 0
                      ? 'Быстрый заказ в колонку Новые'
                      : `Добавить заказ в колонку ${col.title}`
                  }
                  className="w-full py-1.5 px-3 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {colIndex === 0 && <span>Быстрый заказ</span>}
                </button>
              </div>

              {/* Карточки сделок/заказов */}
              <div className="space-y-3 flex-1">
                {colOrders.map((order) => {
                  const customer = customers.find((c) => c.id === order.customerId);
                  const florist = staff.find((s) => s.id === order.floristUserId);
                  const branch = branches.find((b) => b.id === order.branchId);
                  const readyTimeStr = order.readyByAt.slice(11, 16);
                  const floristInitials = florist
                    ? florist.fullName
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                    : 'ФЛ';

                  return (
                    <div
                      key={order.id}
                      draggable
                      onDragStart={() => setDraggedOrderId(order.id)}
                      className={`bg-white/95 backdrop-blur-sm rounded-xl shadow-md hover:shadow-lg border border-white/60 border-l-4 ${col.cardBorderLeftClass} p-3.5 space-y-2.5 transition-all relative`}
                    >
                      {/* Верхний блок карточки + правая колонка быстрых иконок в стиле Bitrix24 */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenOrderModal(order)}
                              className="font-mono-tabular font-bold text-xs text-slate-900 hover:text-[#0b66c3] hover:underline text-left truncate"
                            >
                              {order.orderNumber}
                            </button>
                          </div>

                          {/* Подзаголовок: Канал · Филиал · Время готовности */}
                          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                            <span
                              className={`font-semibold ${
                                CHANNEL_META[order.source].accentText
                              }`}
                            >
                              {CHANNEL_META[order.source].shortLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{branch?.code}</span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 text-amber-800 font-mono-tabular font-semibold">
                              <Clock className="w-3 h-3 shrink-0" />к {readyTimeStr}
                            </span>
                          </div>

                          {/* Крупная стоимость букета (строго без разрыва знака ₽) */}
                          <div className="pt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-base font-bold text-slate-900 font-mono-tabular whitespace-nowrap">
                              {formatCurrency(order.totalPrice)}
                            </span>
                            {order.debtAmount > 0 ? (
                              <span className="text-[11px] font-mono-tabular font-semibold text-amber-700 whitespace-nowrap">
                                Долг: {formatCurrency(order.debtAmount)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono-tabular font-medium text-emerald-700 whitespace-nowrap">
                                Оплачен 100%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Правая вертикальная панель иконок (счетчик позиций, звонок, чат, фото) */}
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <span
                            title="Позиций в заказе"
                            className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-mono-tabular font-bold flex items-center justify-center"
                          >
                            {order.items.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenOrderModal(order)}
                            title={`Телефон получателя: ${order.recipientPhone}`}
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenChatTab ? onOpenChatTab() : onOpenOrderModal(order)
                            }
                            title="Открыть переписку с клиентом"
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Название букета и синяя ссылка на клиента/получателя (как в Bitrix24) */}
                      <div
                        onClick={() => onOpenOrderModal(order)}
                        className="cursor-pointer space-y-1"
                      >
                        <p className="text-xs font-semibold text-slate-800 line-clamp-2">
                          {order.items.map((i) => `${i.title} (${i.quantity} шт)`).join(', ')}
                        </p>
                        <p className="text-xs font-medium text-[#0b66c3] hover:underline line-clamp-1">
                          {customer?.fullName} → {order.recipientName}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          {order.fulfillmentType === 'DELIVERY' ? (
                            <>
                              <Truck className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {order.deliveryDate} ({order.deliveryWindow})
                              </span>
                            </>
                          ) : (
                            <>
                              <Store className="w-3 h-3 shrink-0 text-slate-400" />
                              <span>Самовывоз из салона</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Превью фото готового букета ИЛИ кнопка быстрой загрузки с камеры */}
                      {order.beforeDeliveryPhotoUrl ? (
                        <div className="space-y-1.5">
                          <ResilientBouquetImage
                            src={order.beforeDeliveryPhotoUrl}
                            alt={`Фото букета ${order.orderNumber}`}
                            className="w-full h-24 object-cover rounded-lg border border-slate-200"
                          />
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {PHOTO_STATUS_LABELS[order.photoApprovalStatus]}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-sky-50/80 border border-sky-200/80 space-y-1.5">
                          <div className="inline-block px-2 py-0.5 rounded-full bg-sky-100 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                            Требуется фото букета до доставки
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickUploadBouquetPhoto(
                                order.id,
                                BOUQUET_IMAGES.HYDRANGEA_CLOUD
                              )
                            }
                            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-sky-300 text-sky-950 rounded-md hover:bg-sky-100 whitespace-nowrap transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5 shrink-0 text-sky-600" />
                            Загрузить фото букета
                          </button>
                        </div>
                      )}

                      {/* Ответственный флорист (с аватаром как на скриншоте) + Себестоимость/Прибыль */}
                      <div className="pt-1.5 border-t border-slate-100 space-y-1.5 text-xs">
                        {order.totalCostPrice > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-slate-500 font-mono-tabular">
                            <span className="whitespace-nowrap">
                              Себест: {formatCurrency(order.totalCostPrice)}
                            </span>
                            <span className="whitespace-nowrap">
                              Прибыль:{' '}
                              <strong className="text-emerald-700">
                                {formatCurrency(order.netProfit)}
                              </strong>
                            </span>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-400">Ответственный</div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {floristInitials}
                              </span>
                              <span className="text-[11px] font-medium text-slate-700 truncate">
                                Флорист: {florist?.fullName.split(' ')[0] || 'Не назначен'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
                              к {readyTimeStr}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Нижняя панель действий карточки (+ Дело / Перевод стадии) */}
                      <div className="pt-1.5 border-t border-slate-100 flex flex-col gap-1.5">
                        {col.nextStatus && order.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => attemptStatusChange(order, col.nextStatus!)}
                            className="w-full flex items-center justify-between gap-1 py-1.5 px-2.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-[#2fc6f6] hover:text-slate-950 rounded-lg transition-colors text-left"
                          >
                            <span className="truncate">+ {col.nextButtonLabel}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                          </button>
                        )}
                        {kanbanColumns[colIndex + 1]?.isCustom && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomColumnByOrderId((prev) => ({
                                ...prev,
                                [order.id]: kanbanColumns[colIndex + 1].id,
                              }))
                            }
                            className="w-full flex items-center justify-between gap-1 py-1.5 px-2.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-[#9dcf00] hover:text-slate-950 rounded-lg transition-colors text-left"
                          >
                            <span className="truncate">
                              + В этап «{kanbanColumns[colIndex + 1].title}»
                            </span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                          </button>
                        )}
                        {order.status === 'IN_ASSEMBLY' && !order.beforeDeliveryPhotoUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              attemptStatusChange(order, 'READY_FOR_DELIVERY')
                            }
                            className="w-full py-1 px-2 text-[11px] text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg truncate"
                          >
                            Выдать в доставку без фото
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* В первой колонке снизу: полупрозрачный виджет Контакт-центра как на скриншоте */}
                {colIndex === 0 && (
                  <div className="bg-black/35 backdrop-blur-md border border-white/20 rounded-xl p-4 text-white space-y-3 shadow-lg">
                    <div className="text-center space-y-0.5">
                      <div className="text-xs font-bold text-white">
                        Омниканальный Контакт-центр
                      </div>
                      <div className="text-[11px] text-white/80">
                        Автоматическое добавление заказов
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-white/90 pt-1">
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#2fc6f6] shrink-0" />
                        <span className="truncate">ВКонтакте</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <Send className="w-3.5 h-3.5 text-[#2fc6f6] shrink-0" />
                        <span className="truncate">Telegram</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-[#a5de00] shrink-0" />
                        <span className="truncate">Flowwow</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span className="truncate">Flavary</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <Mail className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                        <span className="truncate">MAX Бот</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenChatTab}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/15 transition-colors text-left"
                      >
                        <Globe className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span className="truncate">Сайт салона</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-white/15 text-center">
                      <button
                        type="button"
                        onClick={onOpenAnalyticsTab}
                        className="inline-flex items-center gap-1 text-[11px] text-white/90 hover:text-white underline decoration-white/50"
                      >
                        <FileSpreadsheet className="w-3 h-3 shrink-0 text-[#a5de00]" />
                        <span>Выгрузка и аналитика в таблицы Excel</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
